import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Categoria {
  id: string;
  name: string;
}

interface Resultado {
  categoria_id: string | null;
  categoria_nome: string | null;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
}

// ─── Classificação via Groq (texto) ───────────────────────────────────────────
async function classificar(texto: string, categorias: Categoria[], apiKey: string): Promise<Resultado> {
  const lista = categorias.map((c) => `- ${c.id}: ${c.name}`).join("\n") || "(nenhuma categoria de despesa cadastrada)";

  const prompt = `Você analisa comprovantes de pagamento brasileiros (PIX, TED, boleto, cartão) e identifica a que tipo de despesa doméstica eles pertencem.

Texto extraído do comprovante em PDF:
"""
${texto.slice(0, 6000)}
"""

Categorias de despesa já cadastradas nesta casa (use o id exatamente como está):
${lista}

Escolha a categoria existente que melhor representa essa despesa. Retorne APENAS um JSON válido neste formato:
{
  "categoria_id": "<id de uma das categorias acima, ou null se nenhuma combinar bem>",
  "categoria_nome": "<nome da categoria escolhida, ou uma sugestão de nome de categoria nova caso nenhuma combine>",
  "confianca": "alta" | "media" | "baixa",
  "motivo": "<explicação breve em português, em até 1 frase, do porquê dessa categoria>"
}
Responda SOMENTE com o JSON, sem markdown, sem explicações adicionais.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 400,
    }),
  });

  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);

  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq não retornou conteúdo.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Resposta do Groq não é JSON válido: " + text.slice(0, 300));
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY não configurada nos secrets da função." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Token de autenticação ausente." }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authErr } = await sb.auth.getUser(authHeader.slice(7));
  if (authErr) return json({ error: "Não autenticado." }, 401);

  let texto: string;
  let categorias: Categoria[];
  try {
    const body = await req.json();
    texto = String(body.texto ?? "").trim();
    categorias = Array.isArray(body.categorias) ? body.categorias : [];
    if (!texto) return json({ error: "Envie o texto extraído do comprovante (campo 'texto')." }, 400);
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  try {
    const resultado = await classificar(texto, categorias, GROQ_API_KEY);
    return json({ resultado });
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }
});

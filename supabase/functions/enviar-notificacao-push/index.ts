import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Chave pública VAPID — é segura para ficar no código-fonte (mesma usada em
// assets/js/notifications.js); só a privada precisa ser secret da função.
const VAPID_PUBLIC_KEY = "BP89pAS6oWZX4fokSjawJ1eik2qZKfAR4U-Gow7BROd8G0d-mbLIJv-4XmY0v400U7ljYtrdz51Ag1nqLTW1_Os";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function formatBRL(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Esta função é chamada pelo gatilho do banco (pg_net), não pelo navegador,
// por isso usa um segredo compartilhado em vez de JWT de usuário (verify_jwt=false).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const internalSecret = Deno.env.get("PUSH_TRIGGER_SECRET") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!internalSecret || req.headers.get("x-internal-secret") !== internalSecret) {
    return json({ error: "Não autorizado." }, 401);
  }
  if (!vapidPrivateKey || !vapidSubject) {
    return json({ error: "Chaves VAPID não configuradas nos secrets da função." }, 500);
  }

  let notificationId = "";
  try {
    const body = await req.json();
    notificationId = String(body?.notification_id ?? "");
    if (!notificationId) throw new Error("missing id");
  } catch {
    return json({ error: "Corpo inválido: esperado { notification_id }." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: notif, error: notifError } = await supabase
    .from("finance_notifications")
    .select("id, household_id, created_by, category_name, description, amount")
    .eq("id", notificationId)
    .maybeSingle();

  if (notifError || !notif) {
    return json({ error: "Aviso não encontrado." }, 404);
  }

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", notif.household_id);

  const senderName = members?.find((m) => m.user_id === notif.created_by)?.display_name ?? "Alguém da casa";

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("household_id", notif.household_id)
    .neq("user_id", notif.created_by);

  if (!subscriptions || subscriptions.length === 0) {
    return json({ ok: true, sent: 0, removed: 0 });
  }

  webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const payload = JSON.stringify({
    title: "Nova despesa lançada",
    body: `${senderName} · ${notif.category_name || "Sem categoria"} · ${formatBRL(Number(notif.amount))} · ${notif.description}`,
    tag: `finance-notif-${notif.id}`,
    url: "./financeiro.html",
  });

  let sent = 0;
  const stale: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id);
        } else {
          console.error("Falha ao enviar push", sub.id, err);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }

  return json({ ok: true, sent, removed: stale.length });
});

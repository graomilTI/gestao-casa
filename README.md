# 🏡 Gestão de Casa

Sistema web para organizar a vida doméstica em família: **controle financeiro**,
**agenda compartilhada** e **divisão de tarefas**. Construído com HTML/CSS/JS puro
no front-end e [Supabase](https://supabase.com) (Postgres + Auth) no back-end.

## Funcionalidades

- **Autenticação** — cadastro/login por e-mail e senha (Supabase Auth)
- **Casa compartilhada** — crie uma "casa" e convide os outros moradores com um
  código de convite; cada lançamento, evento e tarefa fica visível para todos os
  membros
- **Financeiro** — lançamentos de receitas e despesas, categorias personalizadas,
  filtros por mês/tipo/categoria e resumo do saldo mensal
- **Agenda** — calendário mensal com eventos compartilhados (data/hora, local,
  cor, descrição)
- **Tarefas** — quadro kanban (Pendente / Em andamento / Concluída) com
  responsável, prioridade, prazo e recorrência
- **Rotina familiar** — lista das atividades programadas para o dia (com
  horário, responsável e dias da semana) e opção de marcar "check" em cada uma
  ao concluí-la
- **Identificar despesa por comprovante** — pelo celular, compartilhe o PDF do
  comprovante de pagamento (ou selecione o arquivo) direto para o app; o texto
  é lido localmente e uma IA (Groq) sugere o tipo de despesa e o valor pago
  entre as categorias já cadastradas, com atalho para já abrir o lançamento
  preenchido (categoria, descrição e valor)
- **Avisos de lançamentos** — sempre que alguém lança uma despesa, os outros
  moradores recebem um aviso em tempo real (sino na barra lateral) com a
  categoria e o valor, além de uma notificação do sistema (PWA) se a permissão
  estiver concedida

## Stack

- Front-end: HTML, CSS e JavaScript puro (sem build step)
- Back-end: [Supabase](https://supabase.com) — Postgres com Row Level Security,
  Auth e API automática via `supabase-js`

## Configuração

### 1. Crie um projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto.
2. No **SQL Editor**, execute o script [`supabase/schema.sql`](supabase/schema.sql).
   Ele cria todas as tabelas (`households`, `household_members`,
   `finance_categories`, `finance_transactions`, `finance_notifications`,
   `finance_notification_reads`, `agenda_events`, `tasks`,
   `routine_activities`, `routine_checks`), o gatilho que gera os avisos de
   despesa e as políticas de Row Level Security
   que garantem que cada "casa" só vê seus próprios dados.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

### 1.1. (Opcional) Identificar despesa por comprovante

Esse recurso usa uma Edge Function (`supabase/functions/identificar-comprovante`)
que já está implantada no projeto e chama a [Groq API](https://console.groq.com)
(gratuita) para classificar o tipo de despesa a partir do texto do comprovante.
Para habilitar:

1. Crie uma chave em [console.groq.com/keys](https://console.groq.com/keys).
2. No Supabase Dashboard, vá em **Edge Functions → identificar-comprovante →
   Secrets** e adicione `GROQ_API_KEY` com o valor da chave.

Sem essa chave configurada, a página **Comprovante** continua acessível, mas a
identificação retorna erro.

### 2. Configure as credenciais do front-end

Copie o arquivo de exemplo e preencha com os dados do seu projeto:

```bash
cp assets/js/config.example.js assets/js/config.js
```

```js
// assets/js/config.js
window.SUPABASE_CONFIG = {
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'SUA-CHAVE-ANON-PUBLICA',
};
```

> A `anonKey` é a chave **pública** do Supabase — ela é segura para ficar no
> repositório e em sites estáticos (a proteção real dos dados vem das políticas
> de Row Level Security do banco, não do segredo dessa chave).

### 3. Rode localmente

Como é um projeto sem build step, basta servir os arquivos estáticos. Por
exemplo, com Python:

```bash
python -m http.server 8080
```

ou com a extensão **Live Server** do VS Code. Depois acesse
`http://localhost:8080`.

## Como usar

1. **Cadastre-se** na tela inicial (confirme o e-mail se a confirmação estiver
   habilitada no projeto Supabase).
2. Na tela de configuração, **crie uma casa nova** (você vira administrador(a) e
   recebe um código de convite) ou **entre em uma casa existente** informando o
   código que outro morador compartilhou com você.
3. Use o menu lateral para navegar entre **Início**, **Financeiro**, **Agenda**,
   **Tarefas**, **Rotina familiar** e **Comprovante**.
4. Para identificar uma despesa pelo comprovante, abra **Comprovante** pelo
   celular: use o botão **Compartilhar** do app do banco e escolha "Gestão de
   Casa" (ou selecione o PDF manualmente). A IA sugere a categoria e o valor, e
   oferece um atalho para já abrir o lançamento de despesa preenchido.
5. Sempre que alguém lançar uma despesa em **Financeiro**, os demais moradores
   recebem um aviso instantâneo no sino 🔔 da barra lateral (categoria e
   valor). Ao clicar no sino pela primeira vez, o navegador pode pedir
   permissão para enviar **notificações do sistema** — aceite para também
   receber o aviso fora da aba do app.

## Estrutura do projeto

```
├── index.html            # Login / cadastro
├── setup.html            # Criar ou entrar em uma casa
├── dashboard.html        # Visão geral (resumo financeiro, agenda, tarefas)
├── financeiro.html       # Controle financeiro
├── agenda.html           # Agenda / calendário
├── tarefas.html          # Divisão de tarefas (kanban)
├── rotina.html           # Rotina familiar (atividades do dia com check)
├── comprovante.html      # Identificar tipo de despesa por comprovante (PDF)
├── assets/
│   ├── css/style.css     # Estilos compartilhados
│   └── js/
│       ├── config.example.js   # Modelo de configuração do Supabase
│       ├── supabase-client.js  # Inicialização do cliente supabase-js
│       ├── app.js              # Sessão, layout e helpers compartilhados
│       ├── notifications.js    # Sino de avisos de despesas (tempo real + PWA)
│       ├── auth.js             # Login / cadastro
│       ├── setup.js            # Criar / entrar em uma casa
│       ├── dashboard.js
│       ├── financeiro.js
│       ├── agenda.js
│       ├── tarefas.js
│       ├── rotina.js
│       └── comprovante.js
└── supabase/
    ├── schema.sql        # Tabelas + Row Level Security
    └── functions/
        └── identificar-comprovante/   # Edge Function (Groq) que sugere a categoria
```

## Segurança

Todas as tabelas têm **Row Level Security (RLS)** habilitada: um usuário só
consegue ler ou escrever dados da(s) casa(s) das quais é membro
(`household_members`). A função `is_household_member()` centraliza essa
verificação nas políticas do banco.

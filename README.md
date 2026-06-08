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

## Stack

- Front-end: HTML, CSS e JavaScript puro (sem build step)
- Back-end: [Supabase](https://supabase.com) — Postgres com Row Level Security,
  Auth e API automática via `supabase-js`

## Configuração

### 1. Crie um projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto.
2. No **SQL Editor**, execute o script [`supabase/schema.sql`](supabase/schema.sql).
   Ele cria todas as tabelas (`households`, `household_members`,
   `finance_categories`, `finance_transactions`, `agenda_events`, `tasks`) e as
   políticas de Row Level Security que garantem que cada "casa" só vê seus
   próprios dados.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

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

> `assets/js/config.js` está no `.gitignore` — suas credenciais não vão para o
> repositório.

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
3. Use o menu lateral para navegar entre **Início**, **Financeiro**, **Agenda**
   e **Tarefas**.

## Estrutura do projeto

```
├── index.html            # Login / cadastro
├── setup.html            # Criar ou entrar em uma casa
├── dashboard.html        # Visão geral (resumo financeiro, agenda, tarefas)
├── financeiro.html       # Controle financeiro
├── agenda.html           # Agenda / calendário
├── tarefas.html          # Divisão de tarefas (kanban)
├── assets/
│   ├── css/style.css     # Estilos compartilhados
│   └── js/
│       ├── config.example.js   # Modelo de configuração do Supabase
│       ├── supabase-client.js  # Inicialização do cliente supabase-js
│       ├── app.js              # Sessão, layout e helpers compartilhados
│       ├── auth.js             # Login / cadastro
│       ├── setup.js            # Criar / entrar em uma casa
│       ├── dashboard.js
│       ├── financeiro.js
│       ├── agenda.js
│       └── tarefas.js
└── supabase/
    └── schema.sql        # Tabelas + Row Level Security
```

## Segurança

Todas as tabelas têm **Row Level Security (RLS)** habilitada: um usuário só
consegue ler ou escrever dados da(s) casa(s) das quais é membro
(`household_members`). A função `is_household_member()` centraliza essa
verificação nas políticas do banco.

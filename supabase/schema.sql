-- Sistema de Gestão de Casa
-- Schema do banco de dados (PostgreSQL / Supabase)
-- Execute este script no SQL Editor do seu projeto Supabase

-- ============================================================
-- EXTENSÕES
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELA: households (a "casa" / família compartilhada)
-- ============================================================
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: household_members (quem participa de cada casa)
-- ============================================================
create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#6366f1',
  role text not null default 'membro' check (role in ('admin', 'membro')),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- ============================================================
-- TABELA: finance_categories (categorias de receitas/despesas)
-- ============================================================
create table if not exists finance_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('receita', 'despesa')),
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: finance_transactions (lançamentos financeiros)
-- ============================================================
create table if not exists finance_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid references finance_categories(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('receita', 'despesa')),
  occurred_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_transactions_household_date
  on finance_transactions (household_id, occurred_on desc);

-- ============================================================
-- TABELA: agenda_events (eventos da agenda da casa)
-- ============================================================
create table if not exists agenda_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create index if not exists idx_agenda_events_household_start
  on agenda_events (household_id, start_at);

-- ============================================================
-- TABELA: tasks (tarefas / divisão de tarefas domésticas)
-- ============================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references household_members(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta')),
  due_date date,
  recurrence text not null default 'nenhuma' check (recurrence in ('nenhuma', 'diaria', 'semanal', 'mensal')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_tasks_household_status
  on tasks (household_id, status);

-- ============================================================
-- FUNÇÃO AUXILIAR: verifica se o usuário pertence à casa
-- ============================================================
create or replace function is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table finance_categories enable row level security;
alter table finance_transactions enable row level security;
alter table agenda_events enable row level security;
alter table tasks enable row level security;

-- households: membros podem ver; quem cria pode inserir
drop policy if exists "households_select" on households;
create policy "households_select" on households
  for select using (is_household_member(id));

drop policy if exists "households_insert" on households;
create policy "households_insert" on households
  for insert with check (created_by = auth.uid());

drop policy if exists "households_update" on households;
create policy "households_update" on households
  for update using (is_household_member(id));

-- household_members: membros da casa podem ver e gerenciar
drop policy if exists "household_members_select" on household_members;
create policy "household_members_select" on household_members
  for select using (is_household_member(household_id));

drop policy if exists "household_members_insert" on household_members;
create policy "household_members_insert" on household_members
  for insert with check (user_id = auth.uid());

drop policy if exists "household_members_update" on household_members;
create policy "household_members_update" on household_members
  for update using (user_id = auth.uid());

drop policy if exists "household_members_delete" on household_members;
create policy "household_members_delete" on household_members
  for delete using (user_id = auth.uid());

-- finance_categories
drop policy if exists "finance_categories_all" on finance_categories;
create policy "finance_categories_all" on finance_categories
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- finance_transactions
drop policy if exists "finance_transactions_all" on finance_transactions;
create policy "finance_transactions_all" on finance_transactions
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "finance_transactions_update_delete" on finance_transactions;
create policy "finance_transactions_update_delete" on finance_transactions
  for update using (is_household_member(household_id));

drop policy if exists "finance_transactions_delete" on finance_transactions;
create policy "finance_transactions_delete" on finance_transactions
  for delete using (is_household_member(household_id));

-- agenda_events
drop policy if exists "agenda_events_all" on agenda_events;
create policy "agenda_events_select" on agenda_events
  for select using (is_household_member(household_id));

drop policy if exists "agenda_events_insert" on agenda_events;
create policy "agenda_events_insert" on agenda_events
  for insert with check (is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "agenda_events_update" on agenda_events;
create policy "agenda_events_update" on agenda_events
  for update using (is_household_member(household_id));

drop policy if exists "agenda_events_delete" on agenda_events;
create policy "agenda_events_delete" on agenda_events
  for delete using (is_household_member(household_id));

-- tasks
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks
  for select using (is_household_member(household_id));

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks
  for insert with check (is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks
  for update using (is_household_member(household_id));

drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks
  for delete using (is_household_member(household_id));

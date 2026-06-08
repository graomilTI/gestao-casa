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
-- TABELAS: finance_notifications / finance_notification_reads
-- (avisos para a casa toda quando alguém lança uma despesa)
-- ============================================================
create table if not exists finance_notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_id uuid references finance_transactions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  category_name text,
  description text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_notifications_household_created
  on finance_notifications (household_id, created_at desc);

create table if not exists finance_notification_reads (
  notification_id uuid not null references finance_notifications(id) on delete cascade,
  member_id uuid not null references household_members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, member_id)
);

-- Sempre que uma despesa é lançada, grava um aviso para a casa toda.
-- SECURITY DEFINER: o gatilho roda com privilégios do dono (postgres),
-- que tem BYPASSRLS, então o INSERT funciona independente de quem lançou.
create or replace function notify_despesa_lancada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
begin
  if new.type = 'despesa' then
    select name into v_categoria from finance_categories where id = new.category_id;

    insert into finance_notifications (household_id, transaction_id, created_by, category_name, description, amount)
    values (new.household_id, new.id, new.created_by, v_categoria, new.description, new.amount);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_despesa_lancada on finance_transactions;
create trigger trg_notify_despesa_lancada
  after insert on finance_transactions
  for each row execute function notify_despesa_lancada();

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
-- TABELA: routine_activities (atividades da rotina diária da família)
-- ============================================================
create table if not exists routine_activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references household_members(id) on delete set null,
  title text not null,
  description text,
  time_of_day time,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_routine_activities_household
  on routine_activities (household_id);

-- ============================================================
-- TABELA: routine_checks ("check" de uma atividade em um dia específico)
-- ============================================================
create table if not exists routine_checks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references routine_activities(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  check_date date not null default current_date,
  checked_by uuid references household_members(id) on delete set null,
  checked_at timestamptz not null default now(),
  unique (activity_id, check_date)
);

create index if not exists idx_routine_checks_activity_date
  on routine_checks (activity_id, check_date);

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
-- FUNÇÕES: criar ou entrar em uma casa
--
-- Necessárias porque, ao criar uma "households" e tentar retorná-la
-- (INSERT ... RETURNING), a política de SELECT (is_household_member)
-- ainda não é satisfeita — o usuário só vira membro no passo seguinte.
-- Por isso a criação da casa e a inclusão do membro acontecem juntas,
-- de forma atômica, dentro de uma função SECURITY DEFINER que usa
-- auth.uid() para garantir que o usuário só age em nome de si mesmo.
-- ============================================================
create or replace function create_household(p_name text, p_display_name text)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into households (name, created_by)
  values (p_name, auth.uid())
  returning * into v_household;

  insert into household_members (household_id, user_id, display_name, role, color)
  values (v_household.id, auth.uid(), p_display_name, 'admin', '#6366f1');

  return v_household;
end;
$$;

create or replace function join_household(p_invite_code text, p_display_name text)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
  v_count int;
  v_colors text[] := array['#6366f1','#ec4899','#16a34a','#d97706','#0ea5e9','#9333ea','#dc2626','#0d9488'];
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_household from households where invite_code = lower(p_invite_code);
  if not found then
    raise exception 'Código de convite não encontrado.';
  end if;

  select count(*) into v_count from household_members where household_id = v_household.id;

  insert into household_members (household_id, user_id, display_name, role, color)
  values (v_household.id, auth.uid(), p_display_name, 'membro', v_colors[(v_count % array_length(v_colors, 1)) + 1]);

  return v_household;
end;
$$;

revoke all on function create_household(text, text) from public;
revoke all on function join_household(text, text) from public;
grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table finance_categories enable row level security;
alter table finance_transactions enable row level security;
alter table agenda_events enable row level security;
alter table tasks enable row level security;
alter table routine_activities enable row level security;
alter table routine_checks enable row level security;

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
drop policy if exists "agenda_events_select" on agenda_events;
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

-- routine_activities
drop policy if exists "routine_activities_select" on routine_activities;
create policy "routine_activities_select" on routine_activities
  for select using (is_household_member(household_id));

drop policy if exists "routine_activities_insert" on routine_activities;
create policy "routine_activities_insert" on routine_activities
  for insert with check (is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "routine_activities_update" on routine_activities;
create policy "routine_activities_update" on routine_activities
  for update using (is_household_member(household_id));

drop policy if exists "routine_activities_delete" on routine_activities;
create policy "routine_activities_delete" on routine_activities
  for delete using (is_household_member(household_id));

-- routine_checks
drop policy if exists "routine_checks_select" on routine_checks;
create policy "routine_checks_select" on routine_checks
  for select using (is_household_member(household_id));

drop policy if exists "routine_checks_insert" on routine_checks;
create policy "routine_checks_insert" on routine_checks
  for insert with check (is_household_member(household_id));

drop policy if exists "routine_checks_delete" on routine_checks;
create policy "routine_checks_delete" on routine_checks
  for delete using (is_household_member(household_id));

-- finance_notifications (somente leitura para os membros; o INSERT é feito
-- pelo gatilho notify_despesa_lancada, que roda com privilégios elevados)
alter table finance_notifications enable row level security;
alter table finance_notification_reads enable row level security;

drop policy if exists "finance_notifications_select" on finance_notifications;
create policy "finance_notifications_select" on finance_notifications
  for select using (is_household_member(household_id));

-- finance_notification_reads: cada membro só vê e marca as próprias leituras
drop policy if exists "finance_notification_reads_select" on finance_notification_reads;
create policy "finance_notification_reads_select" on finance_notification_reads
  for select using (
    exists (
      select 1 from household_members hm
      where hm.id = finance_notification_reads.member_id
        and hm.user_id = auth.uid()
    )
  );

drop policy if exists "finance_notification_reads_insert" on finance_notification_reads;
create policy "finance_notification_reads_insert" on finance_notification_reads
  for insert with check (
    exists (
      select 1 from household_members hm
      where hm.id = finance_notification_reads.member_id
        and hm.user_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME: avisos chegam instantaneamente para os outros membros
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_notifications'
  ) then
    alter publication supabase_realtime add table finance_notifications;
  end if;
end $$;

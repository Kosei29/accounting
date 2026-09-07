-- Accounting core migration
-- Double-entry ledger foundation for the Accounting app.

create extension if not exists pgcrypto;

create type public.account_type as enum (
  'cash','bank','ewallet','savings','investment','credit_card','loan',
  'other_asset','other_liability','equity','income','expense'
);

create type public.account_status as enum ('active','inactive','closed');
create type public.transaction_type as enum ('income','expense','transfer','adjustment');
create type public.transaction_status as enum ('draft','posted','voided');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  account_type public.account_type not null,
  status public.account_status not null default 'active',
  currency char(3) not null default 'PHP',
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  opening_balance_date date not null default current_date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category_type text not null check (category_type in ('income','expense','transfer','other')),
  parent_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  transaction_no bigint generated always as identity unique,
  transaction_date timestamptz not null default now(),
  transaction_type public.transaction_type not null,
  status public.transaction_status not null default 'draft',
  description text not null,
  category_id uuid references public.categories(id) on delete set null,
  reference_no text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  check (status <> 'voided' or voided_at is not null)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  entry_date timestamptz not null,
  memo text,
  created_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  line_memo text,
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index accounts_owner_idx on public.accounts(owner_id);
create index categories_owner_idx on public.categories(owner_id);
create index transactions_owner_date_idx on public.transactions(owner_id, transaction_date desc);
create index transactions_owner_type_idx on public.transactions(owner_id, transaction_type);
create index journal_entries_owner_date_idx on public.journal_entries(owner_id, entry_date desc);
create index journal_lines_account_idx on public.journal_lines(account_id);
create index audit_log_owner_date_idx on public.audit_log(owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts
for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id,
  a.owner_id,
  a.name,
  a.account_type,
  a.currency,
  a.status,
  a.opening_balance + coalesce(sum(
    case when a.account_type in ('loan','credit_card','other_liability','equity','income')
      then jl.credit - jl.debit else jl.debit - jl.credit end
  ) filter (where t.status = 'posted'), 0) as balance
from public.accounts a
left join public.journal_lines jl on jl.account_id = a.id
left join public.journal_entries je on je.id = jl.journal_entry_id
left join public.transactions t on t.id = je.transaction_id
  and t.owner_id = a.owner_id
group by a.id;

create or replace view public.monthly_statistics
with (security_invoker = true) as
select
  t.owner_id,
  date_trunc('month', t.transaction_date)::date as month,
  coalesce(sum(case when t.transaction_type = 'income' then abs(jl.credit - jl.debit) else 0 end),0) as income,
  coalesce(sum(case when t.transaction_type = 'expense' then abs(jl.debit - jl.credit) else 0 end),0) as expenses,
  coalesce(sum(case when t.transaction_type = 'transfer' then abs(jl.debit - jl.credit) else 0 end),0) as transfers
from public.transactions t
join public.journal_entries je on je.transaction_id = t.id
join public.journal_lines jl on jl.journal_entry_id = je.id
where t.status = 'posted'
group by t.owner_id, date_trunc('month', t.transaction_date)::date;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_owner on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy accounts_owner on public.accounts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy categories_owner on public.categories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy transactions_owner on public.transactions for select using (owner_id = auth.uid());
create policy journal_entries_owner on public.journal_entries for select using (owner_id = auth.uid());
create policy journal_lines_owner on public.journal_lines for select using (
  exists (select 1 from public.journal_entries je where je.id = journal_entry_id and je.owner_id = auth.uid())
);
create policy audit_log_owner on public.audit_log for select using (owner_id = auth.uid());

revoke insert, update, delete on public.transactions from anon, authenticated;
revoke insert, update, delete on public.journal_entries from anon, authenticated;
revoke insert, update, delete on public.journal_lines from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;

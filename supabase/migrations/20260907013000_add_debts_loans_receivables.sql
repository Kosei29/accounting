alter table public.accounts add column if not exists is_system boolean not null default false;

create table public.receivables (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  person text not null, original_amount numeric(14,2) not null check (original_amount > 0),
  balance numeric(14,2) not null check (balance >= 0), lent_date date not null default current_date,
  due_date date, notes text, status text not null default 'active' check (status in ('active','paid','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(), receivable_id uuid not null references public.receivables(id) on delete restrict,
  transaction_id uuid not null unique references public.transactions(id) on delete restrict, owner_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0), payment_date date not null default current_date, notes text, created_at timestamptz not null default now()
);
create table public.debts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, creditor text not null, original_amount numeric(14,2) not null check (original_amount > 0), balance numeric(14,2) not null check (balance >= 0),
  incurred_date date not null default current_date, due_date date, notes text, status text not null default 'active' check (status in ('active','paid','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.debts(id) on delete restrict,
  transaction_id uuid not null unique references public.transactions(id) on delete restrict, owner_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0), payment_date date not null default current_date, notes text, created_at timestamptz not null default now()
);
create table public.loans (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, lender text not null, principal numeric(14,2) not null check (principal > 0), balance numeric(14,2) not null check (balance >= 0),
  interest_rate numeric(7,4) not null default 0 check (interest_rate >= 0), start_date date not null default current_date, due_date date, notes text,
  status text not null default 'active' check (status in ('active','paid','cancelled')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.loan_payments (
  id uuid primary key default gen_random_uuid(), loan_id uuid not null references public.loans(id) on delete restrict,
  transaction_id uuid not null unique references public.transactions(id) on delete restrict, owner_id uuid not null references public.profiles(id) on delete cascade,
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0), interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  payment_date date not null default current_date, notes text, created_at timestamptz not null default now(), check (principal_amount + interest_amount > 0)
);

create index receivables_owner_idx on public.receivables(owner_id);
create index receivable_payments_owner_idx on public.receivable_payments(owner_id);
create index receivable_payments_receivable_idx on public.receivable_payments(receivable_id);
create index debts_owner_idx on public.debts(owner_id);
create index debt_payments_owner_idx on public.debt_payments(owner_id);
create index debt_payments_debt_idx on public.debt_payments(debt_id);
create index loans_owner_idx on public.loans(owner_id);
create index loan_payments_owner_idx on public.loan_payments(owner_id);
create index loan_payments_loan_idx on public.loan_payments(loan_id);

create trigger receivables_updated_at before update on public.receivables for each row execute function public.set_updated_at();
create trigger debts_updated_at before update on public.debts for each row execute function public.set_updated_at();
create trigger loans_updated_at before update on public.loans for each row execute function public.set_updated_at();

alter table public.receivables enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;
create policy receivables_owner on public.receivables for select to authenticated using ((select auth.uid()) = owner_id);
create policy receivable_payments_owner on public.receivable_payments for select to authenticated using ((select auth.uid()) = owner_id);
create policy debts_owner on public.debts for select to authenticated using ((select auth.uid()) = owner_id);
create policy debt_payments_owner on public.debt_payments for select to authenticated using ((select auth.uid()) = owner_id);
create policy loans_owner on public.loans for select to authenticated using ((select auth.uid()) = owner_id);
create policy loan_payments_owner on public.loan_payments for select to authenticated using ((select auth.uid()) = owner_id);
revoke insert, update, delete on public.receivables, public.receivable_payments, public.debts, public.debt_payments, public.loans, public.loan_payments from anon, authenticated;

create or replace function public.ensure_control_account(p_owner uuid, p_name text, p_type public.account_type)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_owner <> auth.uid() then raise exception 'Authentication required'; end if;
  select id into v_id from public.accounts where owner_id=p_owner and name=p_name limit 1;
  if v_id is null then
    insert into public.accounts(owner_id,name,account_type,is_system,opening_balance,opening_balance_date) values(p_owner,p_name,p_type,true,0,current_date) returning id into v_id;
  end if;
  return v_id;
end; $$;

create or replace function public.account_asset_balance(p_owner uuid,p_account uuid)
returns numeric language sql security definer set search_path = '' stable as $$
select a.opening_balance + coalesce(sum(jl.debit-jl.credit) filter(where t.status='posted'),0)
from public.accounts a left join public.journal_lines jl on jl.account_id=a.id left join public.journal_entries je on je.id=jl.journal_entry_id
left join public.transactions t on t.id=je.transaction_id and t.owner_id=a.owner_id
where a.id=p_account and a.owner_id=p_owner and a.account_type not in ('income','expense','loan','credit_card','other_liability','equity') group by a.id; $$;

create or replace function public.create_receivable(p_person text,p_amount numeric,p_account_id uuid,p_date date default current_date,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_receivable uuid; v_tx uuid; v_entry uuid; v_control uuid; v_cash numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_person),'') is null or p_amount is null or p_amount<=0 then raise exception 'Enter a person and a positive amount'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and owner_id=v_user and status='active' and account_type not in ('income','expense','loan','credit_card','other_liability','equity')) then raise exception 'Invalid cash account'; end if;
  v_cash:=public.account_asset_balance(v_user,p_account_id); if v_cash<p_amount then raise exception 'Insufficient funds'; end if;
  v_control:=public.ensure_control_account(v_user,'Receivables','other_asset');
  insert into public.receivables(owner_id,person,original_amount,balance,lent_date,due_date,notes) values(v_user,trim(p_person),p_amount,p_amount,p_date,p_due_date,nullif(trim(p_notes),'')) returning id into v_receivable;
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'adjustment','posted','Money lent to '||trim(p_person),nullif(trim(p_notes),''),jsonb_build_object('special_kind','receivable_lend','receivable_id',v_receivable),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Money lent to '||trim(p_person)) returning id into v_entry;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,v_control,p_amount,0,'Receivable from '||trim(p_person)),(v_entry,p_account_id,0,p_amount,'Cash lent');
  return v_receivable;
end; $$;

create or replace function public.pay_receivable(p_receivable_id uuid,p_amount numeric,p_account_id uuid,p_date date default current_date,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_r public.receivables%rowtype; v_tx uuid; v_entry uuid; v_control uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_r from public.receivables where id=p_receivable_id and owner_id=v_user for update;
  if not found then raise exception 'Receivable not found'; end if;
  if v_r.status<>'active' or p_amount is null or p_amount<=0 or p_amount>v_r.balance then raise exception 'Invalid payment amount'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and owner_id=v_user and status='active' and account_type not in ('income','expense','loan','credit_card','other_liability','equity')) then raise exception 'Invalid receiving account'; end if;
  v_control:=public.ensure_control_account(v_user,'Receivables','other_asset');
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'adjustment','posted','Receivable payment from '||v_r.person,nullif(trim(p_notes),''),jsonb_build_object('special_kind','receivable_payment','receivable_id',p_receivable_id),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Receivable payment from '||v_r.person) returning id into v_entry;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,p_account_id,p_amount,0,'Cash received'),(v_entry,v_control,0,p_amount,'Receivable collected');
  insert into public.receivable_payments(receivable_id,transaction_id,owner_id,amount,payment_date,notes) values(p_receivable_id,v_tx,v_user,p_amount,p_date,nullif(trim(p_notes),''));
  update public.receivables set balance=balance-p_amount,status=case when balance-p_amount=0 then 'paid' else 'active' end where id=p_receivable_id;
  return v_tx;
end; $$;

create or replace function public.create_debt(p_name text,p_creditor text,p_amount numeric,p_date date default current_date,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_debt uuid; v_tx uuid; v_entry uuid; v_control uuid; v_expense uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_creditor),'') is null or p_amount is null or p_amount<=0 then raise exception 'Enter debt name, creditor, and positive amount'; end if;
  v_control:=public.ensure_control_account(v_user,'Debts Payable','other_liability'); v_expense:=public.ensure_control_account(v_user,'Debt Expense','expense');
  insert into public.debts(owner_id,name,creditor,original_amount,balance,incurred_date,due_date,notes) values(v_user,trim(p_name),trim(p_creditor),p_amount,p_amount,p_date,p_due_date,nullif(trim(p_notes),'')) returning id into v_debt;
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'expense','posted','Debt incurred: '||trim(p_name),nullif(trim(p_notes),''),jsonb_build_object('special_kind','debt_created','debt_id',v_debt),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Debt incurred: '||trim(p_name)) returning id into v_entry;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,v_expense,p_amount,0,'Debt expense'),(v_entry,v_control,0,p_amount,'Debt payable');
  return v_debt;
end; $$;

create or replace function public.pay_debt(p_debt_id uuid,p_amount numeric,p_account_id uuid,p_date date default current_date,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_d public.debts%rowtype; v_tx uuid; v_entry uuid; v_control uuid; v_cash numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_d from public.debts where id=p_debt_id and owner_id=v_user for update;
  if not found then raise exception 'Debt not found'; end if;
  if v_d.status<>'active' or p_amount is null or p_amount<=0 or p_amount>v_d.balance then raise exception 'Invalid payment amount'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and owner_id=v_user and status='active' and account_type not in ('income','expense','loan','credit_card','other_liability','equity')) then raise exception 'Invalid payment account'; end if;
  v_cash:=public.account_asset_balance(v_user,p_account_id); if v_cash<p_amount then raise exception 'Insufficient funds'; end if;
  v_control:=public.ensure_control_account(v_user,'Debts Payable','other_liability');
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'adjustment','posted','Debt payment: '||v_d.name,nullif(trim(p_notes),''),jsonb_build_object('special_kind','debt_payment','debt_id',p_debt_id),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Debt payment: '||v_d.name) returning id into v_entry;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,v_control,p_amount,0,'Debt reduced'),(v_entry,p_account_id,0,p_amount,'Cash paid');
  insert into public.debt_payments(debt_id,transaction_id,owner_id,amount,payment_date,notes) values(p_debt_id,v_tx,v_user,p_amount,p_date,nullif(trim(p_notes),''));
  update public.debts set balance=balance-p_amount,status=case when balance-p_amount=0 then 'paid' else 'active' end where id=p_debt_id;
  return v_tx;
end; $$;

create or replace function public.create_loan(p_name text,p_lender text,p_principal numeric,p_account_id uuid,p_interest_rate numeric default 0,p_date date default current_date,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_loan uuid; v_tx uuid; v_entry uuid; v_control uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_lender),'') is null or p_principal is null or p_principal<=0 then raise exception 'Enter loan name, lender, and positive principal'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and owner_id=v_user and status='active' and account_type not in ('income','expense','loan','credit_card','other_liability','equity')) then raise exception 'Invalid receiving account'; end if;
  v_control:=public.ensure_control_account(v_user,'Loans Payable','loan');
  insert into public.loans(owner_id,name,lender,principal,balance,interest_rate,start_date,due_date,notes) values(v_user,trim(p_name),trim(p_lender),p_principal,p_principal,coalesce(p_interest_rate,0),p_date,p_due_date,nullif(trim(p_notes),'')) returning id into v_loan;
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'adjustment','posted','Loan received: '||trim(p_name),nullif(trim(p_notes),''),jsonb_build_object('special_kind','loan_created','loan_id',v_loan),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Loan received: '||trim(p_name)) returning id into v_entry;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,p_account_id,p_principal,0,'Loan proceeds'),(v_entry,v_control,0,p_principal,'Loan principal payable');
  return v_loan;
end; $$;

create or replace function public.pay_loan(p_loan_id uuid,p_principal numeric,p_interest numeric,p_account_id uuid,p_date date default current_date,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_l public.loans%rowtype; v_tx uuid; v_entry uuid; v_control uuid; v_interest uuid; v_total numeric; v_cash numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_l from public.loans where id=p_loan_id and owner_id=v_user for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_l.status<>'active' then raise exception 'Loan is not active'; end if;
  if coalesce(p_principal,0)<0 or coalesce(p_interest,0)<0 or coalesce(p_principal,0)+coalesce(p_interest,0)<=0 then raise exception 'Enter a positive principal or interest amount'; end if;
  if coalesce(p_principal,0)>v_l.balance then raise exception 'Principal payment exceeds remaining loan balance'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and owner_id=v_user and status='active' and account_type not in ('income','expense','loan','credit_card','other_liability','equity')) then raise exception 'Invalid payment account'; end if;
  v_total:=coalesce(p_principal,0)+coalesce(p_interest,0); v_cash:=public.account_asset_balance(v_user,p_account_id); if v_cash<v_total then raise exception 'Insufficient funds'; end if;
  v_control:=public.ensure_control_account(v_user,'Loans Payable','loan'); if coalesce(p_interest,0)>0 then v_interest:=public.ensure_control_account(v_user,'Interest Expense','expense'); end if;
  insert into public.transactions(owner_id,transaction_date,transaction_type,status,description,notes,metadata,posted_at) values(v_user,p_date,'adjustment','posted','Loan payment: '||v_l.name,nullif(trim(p_notes),''),jsonb_build_object('special_kind','loan_payment','loan_id',p_loan_id),now()) returning id into v_tx;
  insert into public.journal_entries(transaction_id,owner_id,entry_date,memo) values(v_tx,v_user,p_date,'Loan payment: '||v_l.name) returning id into v_entry;
  if coalesce(p_principal,0)>0 then insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,v_control,p_principal,0,'Loan principal repaid'); end if;
  if coalesce(p_interest,0)>0 then insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,v_interest,p_interest,0,'Loan interest'); end if;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit,line_memo) values(v_entry,p_account_id,0,v_total,'Cash paid');
  insert into public.loan_payments(loan_id,transaction_id,owner_id,principal_amount,interest_amount,payment_date,notes) values(p_loan_id,v_tx,v_user,coalesce(p_principal,0),coalesce(p_interest,0),p_date,nullif(trim(p_notes),''));
  update public.loans set balance=balance-coalesce(p_principal,0),status=case when balance-coalesce(p_principal,0)=0 then 'paid' else 'active' end where id=p_loan_id;
  return v_tx;
end; $$;

create or replace function public.void_transaction(p_transaction_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Void reason is required'; end if;
  if exists(select 1 from public.transactions where id=p_transaction_id and owner_id=auth.uid() and metadata ? 'special_kind') then raise exception 'Special transactions must be managed from their dedicated section'; end if;
  update public.transactions set status='voided',voided_at=now(),void_reason=trim(p_reason) where id=p_transaction_id and owner_id=auth.uid() and status='posted';
  if not found then raise exception 'Transaction not found or already voided'; end if;
end; $$;

create or replace view public.monthly_statistics with (security_invoker=true) as
select t.owner_id,date_trunc('month',t.transaction_date)::date as month,
coalesce(sum(case when a.account_type='income' then jl.credit-jl.debit else 0 end),0) as income,
coalesce(sum(case when a.account_type='expense' then jl.debit-jl.credit else 0 end),0) as expenses,
coalesce(sum(case when t.transaction_type='transfer' then abs(jl.debit-jl.credit) else 0 end),0) as transfers
from public.transactions t join public.journal_entries je on je.transaction_id=t.id join public.journal_lines jl on jl.journal_entry_id=je.id join public.accounts a on a.id=jl.account_id
where t.status='posted' group by t.owner_id,date_trunc('month',t.transaction_date)::date;

revoke all on function public.ensure_control_account(uuid,text,public.account_type) from public,anon,authenticated;
revoke all on function public.account_asset_balance(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_receivable(text,numeric,uuid,date,date,text) from public,anon;
revoke all on function public.pay_receivable(uuid,numeric,uuid,date,text) from public,anon;
revoke all on function public.create_debt(text,text,numeric,date,date,text) from public,anon;
revoke all on function public.pay_debt(uuid,numeric,uuid,date,date,text) from public,anon;
revoke all on function public.create_loan(text,text,numeric,uuid,numeric,date,date,text) from public,anon;
revoke all on function public.pay_loan(uuid,numeric,numeric,uuid,date,text) from public,anon;
grant execute on function public.create_receivable(text,numeric,uuid,date,date,text) to authenticated;
grant execute on function public.pay_receivable(uuid,numeric,uuid,date,text) to authenticated;
grant execute on function public.create_debt(text,text,numeric,date,date,text) to authenticated;
grant execute on function public.pay_debt(uuid,numeric,uuid,date,date,text) to authenticated;
grant execute on function public.create_loan(text,text,numeric,uuid,numeric,date,date,text) to authenticated;
grant execute on function public.pay_loan(uuid,numeric,numeric,uuid,date,text) to authenticated;

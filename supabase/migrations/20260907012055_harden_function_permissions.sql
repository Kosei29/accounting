-- Harden function permissions and add controlled transaction posting/voiding.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(owner_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    case when tg_op = 'DELETE' then old.owner_id else new.owner_id end,
    auth.uid(), tg_op, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger accounts_audit after insert or update or delete on public.accounts
for each row execute function public.audit_row_change();
create trigger categories_audit after insert or update or delete on public.categories
for each row execute function public.audit_row_change();
create trigger transactions_audit after insert or update or delete on public.transactions
for each row execute function public.audit_row_change();

create or replace function public.prevent_posted_transaction_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'posted' and (
    new.owner_id <> old.owner_id or
    new.transaction_date <> old.transaction_date or
    new.transaction_type <> old.transaction_type or
    new.description <> old.description or
    coalesce(new.category_id,'00000000-0000-0000-0000-000000000000') <> coalesce(old.category_id,'00000000-0000-0000-0000-000000000000') or
    coalesce(new.reference_no,'') <> coalesce(old.reference_no,'') or
    coalesce(new.notes,'') <> coalesce(old.notes,'')
  ) then
    raise exception 'Posted transactions are immutable. Void and replace instead.';
  end if;
  return new;
end;
$$;

create trigger prevent_posted_transaction_mutation
before update on public.transactions
for each row execute function public.prevent_posted_transaction_mutation();

create or replace function public.post_transaction(
  p_transaction_date timestamptz,
  p_transaction_type public.transaction_type,
  p_description text,
  p_category_id uuid default null,
  p_debit_account_id uuid default null,
  p_credit_account_id uuid default null,
  p_amount numeric default null,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tx uuid;
  v_entry uuid;
  v_currency char(3);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Description is required'; end if;
  if p_debit_account_id is null or p_credit_account_id is null then raise exception 'Both debit and credit accounts are required'; end if;
  if p_debit_account_id = p_credit_account_id then raise exception 'Debit and credit accounts must be different'; end if;

  select currency into v_currency
  from public.accounts
  where id = p_debit_account_id and owner_id = v_user and status = 'active';
  if v_currency is null then raise exception 'Invalid debit account'; end if;

  if not exists (
    select 1 from public.accounts
    where id = p_credit_account_id and owner_id = v_user and status = 'active' and currency = v_currency
  ) then
    raise exception 'Invalid credit account or currency mismatch';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and owner_id = v_user and active
  ) then
    raise exception 'Invalid category';
  end if;

  insert into public.transactions(owner_id, transaction_date, transaction_type, description, category_id, reference_no, notes, posted_at, status)
  values (v_user, p_transaction_date, p_transaction_type, trim(p_description), p_category_id, p_reference_no, p_notes, now(), 'posted')
  returning id into v_tx;

  insert into public.journal_entries(transaction_id, owner_id, entry_date, memo)
  values (v_tx, v_user, p_transaction_date, trim(p_description))
  returning id into v_entry;

  insert into public.journal_lines(journal_entry_id, account_id, debit, credit, line_memo)
  values
    (v_entry, p_debit_account_id, p_amount, 0, trim(p_description)),
    (v_entry, p_credit_account_id, 0, p_amount, trim(p_description));

  return v_tx;
end;
$$;

create or replace function public.void_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Void reason is required'; end if;

  update public.transactions
  set status = 'voided', voided_at = now(), void_reason = trim(p_reason)
  where id = p_transaction_id and owner_id = auth.uid() and status = 'posted';

  if not found then raise exception 'Transaction not found or already voided'; end if;
end;
$$;

revoke all on function public.post_transaction(timestamptz, public.transaction_type, text, uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.post_transaction(timestamptz, public.transaction_type, text, uuid, uuid, uuid, numeric, text, text) to authenticated;

revoke all on function public.void_transaction(uuid, text) from public, anon;
grant execute on function public.void_transaction(uuid, text) to authenticated;

revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.prevent_posted_transaction_mutation() from public, anon, authenticated;

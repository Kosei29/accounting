-- Index foreign-key columns used by ownership, hierarchy, and ledger joins.

create index audit_log_actor_idx on public.audit_log(actor_id);
create index categories_parent_idx on public.categories(parent_id);
create index journal_lines_entry_idx on public.journal_lines(journal_entry_id);
create index transactions_category_idx on public.transactions(category_id);

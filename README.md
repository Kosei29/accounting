# Accounting

Personal accounting and auditing for me and my partner.

## Stack

- React + Vite + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- GitHub for source control

## Current foundation

1. **Project scaffold** — Vite/React/TypeScript structure is in place.
2. **Supabase connection** — frontend client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **Authentication** — email/password sign-in and sign-up are wired to Supabase Auth.
4. **Accounts** — users can create and view their own accounts and opening balances.
5. **Transaction engine** — income, expense, and transfer forms call the secured `post_transaction` RPC and create balanced journal entries.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Put the Supabase project URL and frontend-safe publishable/anon key in `.env.local`. Never put a service-role key in the frontend or commit secrets to GitHub.

Database migrations live in `supabase/migrations/`.

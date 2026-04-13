# regnskabsprogram

Dansk SMB MVP: fakturaer, bilag, Stripe-abonnement, dashboard. Frontend i `web/` (Vite + React), backend i `supabase/` (PostgreSQL, RLS, Edge Functions).

## Kom i gang

```bash
cd web && npm install && npm run dev
```

Kopiér `web/.env.example` til `web/.env.local` og sæt Supabase URL + anon key. Kør SQL-migrationen i Supabase Dashboard (fil: `supabase/migrations/20260406000000_initial_schema.sql`).

## Edge Functions

Stripe: `stripe-checkout`, `stripe-webhook`. Sæt secrets i Supabase (se projektets dokumentation). Bank (Aiia) er udskudt i UI.

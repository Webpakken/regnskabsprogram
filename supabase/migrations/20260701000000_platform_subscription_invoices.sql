-- Bilago: når en virksomhed betaler sit abonnement (Stripe-hævning), udsteder
-- Bilago sin egen faktura med et løbende Bilago-fakturanummer, gemmer den som et
-- bilag hos virksomheden og mailer PDF'en. Denne tabel er både fakturaregister
-- og idempotens-nøgle (unik pr. Stripe-faktura, så webhook-retries ikke laver
-- dubletter).

-- Egen løbende nummerserie til Bilagos abonnements-fakturaer.
create sequence if not exists public.bilago_subscription_invoice_seq;

create table if not exists public.platform_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  -- Løbende nummer + menneskeligt fakturanummer (fx BILAGO-00001).
  invoice_seq bigint not null default nextval('public.bilago_subscription_invoice_seq'),
  invoice_number text not null
    generated always as ('BILAGO-' || lpad(invoice_seq::text, 5, '0')) stored,
  company_id uuid references public.companies (id) on delete set null,
  stripe_invoice_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  currency text not null default 'DKK',
  net_cents bigint not null default 0 check (net_cents >= 0),
  vat_cents bigint not null default 0 check (vat_cents >= 0),
  gross_cents bigint not null default 0 check (gross_cents >= 0),
  vat_rate numeric(5, 2) not null default 25,
  period_start date,
  period_end date,
  plan_name text,
  -- Bilaget der blev oprettet hos virksomheden (kvittering i deres bogføring).
  voucher_id uuid references public.vouchers (id) on delete set null,
  pdf_storage_path text,
  issued_at timestamptz not null default now()
);

create index if not exists platform_subscription_invoices_company_idx
  on public.platform_subscription_invoices (company_id);

comment on table public.platform_subscription_invoices is
  'Bilagos egne abonnements-fakturaer udstedt ved hver Stripe-hævning; unik pr. stripe_invoice_id (idempotens).';

alter table public.platform_subscription_invoices enable row level security;
-- Kun service-role (webhook) og platform-staff tilgår dette register; ingen
-- generelle policies, så almindelige brugere kan ikke læse/skrive. Virksomheden
-- ser fakturaen via det oprettede bilag i vouchers-tabellen i stedet.

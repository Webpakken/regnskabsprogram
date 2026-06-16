-- Bilago: skeln mellem kvittering (allerede betalt) og regning (skal betales),
-- så ubetalte regninger kan markeres og findes. Eksisterende bilag antages at
-- være kvitteringer der allerede er betalt — derfor defaults nedenfor.

alter table public.vouchers
  add column if not exists voucher_type text not null default 'kvittering'
    check (voucher_type in ('kvittering', 'regning')),
  add column if not exists payment_status text not null default 'paid'
    check (payment_status in ('paid', 'unpaid'));

-- Hurtigt opslag på "ubetalte regninger" pr. virksomhed.
create index if not exists vouchers_unpaid_idx
  on public.vouchers (company_id)
  where voucher_type = 'regning' and payment_status = 'unpaid';

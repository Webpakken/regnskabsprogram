-- Kunde-kontaktfelter på faktura: CVR, telefon og adresse hentes typisk fra
-- apicvr.dk når brugeren slår en kunde op via CVR. Vi gemmer dem direkte på
-- fakturaen (ligesom customer_name/customer_email), så de kan vises i UI'et
-- uden separate kunde-tabel-opslag.
alter table public.invoices
  add column if not exists customer_cvr text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists customer_zip text,
  add column if not exists customer_city text;

-- Index på CVR så vi senere kan slå alle fakturaer op for en bestemt kunde
-- (fx "vis alle fakturaer hvor customer_cvr = 37589934").
create index if not exists invoices_company_customer_cvr_idx
  on public.invoices (company_id, customer_cvr)
  where customer_cvr is not null;

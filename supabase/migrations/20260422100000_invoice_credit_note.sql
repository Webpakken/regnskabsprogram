-- Kreditnotaer: peger tilbage på den faktura der krediteres
alter table public.invoices
  add column if not exists credited_invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists invoices_credited_invoice_id_idx
  on public.invoices (credited_invoice_id)
  where credited_invoice_id is not null;

comment on column public.invoices.credited_invoice_id is
  'Når sat: denne post er en kreditnota for den angivne faktura.';

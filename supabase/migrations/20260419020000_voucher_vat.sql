-- Bilago: track VAT on vouchers so we can compute købsmoms for momsangivelse

alter table public.vouchers
  add column if not exists expense_date date not null default current_date,
  add column if not exists gross_cents bigint not null default 0 check (gross_cents >= 0),
  add column if not exists vat_cents bigint not null default 0 check (vat_cents >= 0),
  add column if not exists net_cents bigint not null default 0 check (net_cents >= 0),
  add column if not exists vat_rate numeric(5, 2) not null default 25 check (vat_rate >= 0 and vat_rate <= 100);

create index if not exists vouchers_expense_date_idx on public.vouchers (company_id, expense_date);
create index if not exists invoices_issue_date_company_idx on public.invoices (company_id, issue_date);

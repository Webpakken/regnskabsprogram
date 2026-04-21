alter table public.companies
  add column if not exists invoice_attach_pdf_to_email boolean not null default true;

comment on column public.companies.invoice_attach_pdf_to_email is
  'Ved sendt faktura-mail: vedhæft PDF (standard ja). Kan slås fra under virksomhedsindstillinger.';

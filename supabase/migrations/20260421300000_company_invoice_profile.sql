-- Virksomhed: adresse + faktura-/betalingsoplysninger og logo (sti i storage).
alter table public.companies
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists invoice_email text,
  add column if not exists invoice_phone text,
  add column if not exists invoice_website text,
  add column if not exists bank_reg_number text,
  add column if not exists bank_account_number text,
  add column if not exists iban text,
  add column if not exists invoice_footer_note text,
  add column if not exists invoice_logo_path text;

comment on column public.companies.invoice_logo_path is 'Storage path i bucket company-logos (fx {company_id}/logo.png).';

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

create policy "Company members read company logos"
on storage.objects for select
using (
  bucket_id = 'company-logos'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members where user_id = auth.uid()
  )
);

create policy "Writers upload company logos"
on storage.objects for insert
with check (
  bucket_id = 'company-logos'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

create policy "Writers update company logos"
on storage.objects for update
using (
  bucket_id = 'company-logos'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

create policy "Writers delete company logos"
on storage.objects for delete
using (
  bucket_id = 'company-logos'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

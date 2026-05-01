-- Bulk-import af historiske salgsfakturaer fra andre regnskabsplatforme.
-- * is_historical: markerer at fakturaen er importeret fra et andet system.
--   Bruges til at springe e-mail-udsendelse, PDF-generering, betalings-påmindelser
--   og kunde-portal-flows over — fakturaen er allerede afsluttet andre steder.
-- * attachment_path: peger på den oprindelige PDF i storage-bucket "invoice-archive".
--   Kræves af bogføringsloven (5 års dokumentation).
alter table public.invoices
  add column if not exists is_historical boolean not null default false,
  add column if not exists attachment_path text;

create index if not exists invoices_company_historical_idx
  on public.invoices (company_id, is_historical)
  where is_historical = true;

-- Storage-bucket til de oprindelige PDF'er. Privat (kræver signed URL) — samme
-- mønster som vouchers-bucketten. Filer ligger under "<company_id>/<filename>".
insert into storage.buckets (id, name, public)
values ('invoice-archive', 'invoice-archive', false)
on conflict (id) do nothing;

drop policy if exists "Members upload invoice archive" on storage.objects;
create policy "Members upload invoice archive" on storage.objects for insert
  with check (
    bucket_id = 'invoice-archive'
    and (storage.foldername(name))[1] in (
      select c.id::text from public.companies c
      where c.id in (select user_company_ids())
    )
  );

drop policy if exists "Members read invoice archive" on storage.objects;
create policy "Members read invoice archive" on storage.objects for select
  using (
    bucket_id = 'invoice-archive'
    and (storage.foldername(name))[1] in (
      select c.id::text from public.companies c
      where c.id in (select user_company_ids())
    )
  );

drop policy if exists "Members delete invoice archive" on storage.objects;
create policy "Members delete invoice archive" on storage.objects for delete
  using (
    bucket_id = 'invoice-archive'
    and (storage.foldername(name))[1] in (
      select c.id::text from public.companies c
      where c.id in (select user_company_ids())
    )
  );

-- Dublering-detektion for bilag.
-- * file_hash: sha256 af den uploadede fil. Identisk hash + samme firma = sikker dublering
--   (selvsamme fil-bytes), bruges til hård blokering før insert.
-- * possible_duplicate_of: peger på et eksisterende bilag når dato + beløb matcher inden for
--   ±2 dage. UI viser en advarsel indtil brugeren kvitterer ved at sætte feltet til null.
alter table public.vouchers
  add column if not exists file_hash text,
  add column if not exists possible_duplicate_of uuid
    references public.vouchers(id) on delete set null;

create index if not exists vouchers_company_file_hash_idx
  on public.vouchers (company_id, file_hash)
  where file_hash is not null;

create index if not exists vouchers_company_date_gross_idx
  on public.vouchers (company_id, expense_date, gross_cents);

create index if not exists vouchers_possible_duplicate_idx
  on public.vouchers (possible_duplicate_of)
  where possible_duplicate_of is not null;

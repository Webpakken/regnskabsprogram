-- Bilagsnummer: fortløbende nummer pr. virksomhed, så et bilag kan refereres
-- i banken ("Bilag 42,43,51") og en transaktion altid kan kodes til sit bilag.
-- Samme mønster som fakturanumre (invoice_number_seq), men tildeles automatisk
-- af en trigger, fordi bilag oprettes fra flere steder: bilagslisten, «Scan
-- bilag» og det eksterne udlægslink.

create table if not exists public.voucher_number_seq (
  company_id uuid primary key references public.companies (id) on delete cascade,
  last_value int not null default 0
);

alter table public.vouchers
  add column if not exists voucher_number int;

-- Backfill i den rækkefølge bilagene hører hjemme i regnskabet. Periodelåsen
-- blokerer UPDATE på bilag i låste perioder, så den slås fra imens — vi ændrer
-- kun nummeret, ikke regnskabsdata.
alter table public.vouchers disable trigger vouchers_block_locked_period;

with numbered as (
  select
    id,
    row_number() over (
      partition by company_id
      order by expense_date, uploaded_at, id
    ) as rn
  from public.vouchers
  where voucher_number is null
)
update public.vouchers v
  set voucher_number = n.rn
  from numbered n
  where v.id = n.id;

alter table public.vouchers enable trigger vouchers_block_locked_period;

insert into public.voucher_number_seq (company_id, last_value)
select company_id, max(voucher_number)
from public.vouchers
where voucher_number is not null
group by company_id
on conflict (company_id) do update
  set last_value = greatest(public.voucher_number_seq.last_value, excluded.last_value);

create unique index if not exists vouchers_company_number_key
  on public.vouchers (company_id, voucher_number);

alter table public.vouchers
  alter column voucher_number set not null;

create or replace function public.vouchers_assign_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  -- Eksplicit nummer (fx historisk import) respekteres; serien rykkes frem,
  -- så næste automatiske nummer ikke kolliderer.
  if new.voucher_number is not null then
    insert into public.voucher_number_seq (company_id, last_value)
    values (new.company_id, new.voucher_number)
    on conflict (company_id) do update
      set last_value = greatest(public.voucher_number_seq.last_value, excluded.last_value);
    return new;
  end if;

  insert into public.voucher_number_seq (company_id, last_value)
  values (
    new.company_id,
    coalesce(
      (select max(voucher_number) from public.vouchers where company_id = new.company_id),
      0
    ) + 1
  )
  on conflict (company_id) do update
    set last_value = public.voucher_number_seq.last_value + 1
  returning last_value into v_next;

  new.voucher_number := v_next;
  return new;
end;
$$;

-- Kører før vouchers_block_locked_period (triggere med samme timing kaldes i
-- navnerækkefølge), så nummeret er sat inden periodetjekket.
drop trigger if exists vouchers_assign_number on public.vouchers;
create trigger vouchers_assign_number
  before insert on public.vouchers
  for each row execute function public.vouchers_assign_number();

alter table public.voucher_number_seq enable row level security;

-- Samme opdeling som invoice_number_seq: alle medlemmer må læse, men kun
-- skrivende roller må ændre tælleren. Ellers kunne et menigt medlem sætte
-- last_value ned, hvorefter unique-indekset blokerer al bilagsoprettelse.
drop policy if exists "Members voucher seq" on public.voucher_number_seq;
drop policy if exists "Members read voucher seq" on public.voucher_number_seq;
create policy "Members read voucher seq" on public.voucher_number_seq for select
  using (company_id in (select public.user_company_ids()));
drop policy if exists "Writers write voucher seq" on public.voucher_number_seq;
create policy "Writers write voucher seq" on public.voucher_number_seq for all
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

comment on column public.vouchers.voucher_number is
  'Fortløbende bilagsnummer pr. virksomhed. Tildeles automatisk ved oprettelse og genbruges ikke.';
comment on table public.voucher_number_seq is
  'Sidst brugte bilagsnummer pr. virksomhed.';

notify pgrst, 'reload schema';

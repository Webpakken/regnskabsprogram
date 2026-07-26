-- Indtægtsnummer: fortløbende nummer pr. virksomhed, så en indtægt kan refereres
-- i banken og altid kan kobles til sin indbetaling ved bankafstemning.
--
-- Bogføringsloven kræver transaktionsspor: hver registrering skal kunne følges til
-- sit bilag og omvendt. Indtil nu har indtægter kun kunnet refereres via UUID, og
-- i listen er fx tre «Medlemskontingent / Stripe» kun til at skelne på dato og beløb.
--
-- Egen serie, ikke fælles med bilagsnumre: den ubrudte serie på tværs af alle
-- posteringer hører hjemme på finanskladdens posteringsnummer, når det kommer.
-- Dokumentnumre er referencer ind i den — samme opdeling som e-conomic bruger.
--
-- Mønsteret er kopieret fra voucher_number_seq (20260726100000).

create table if not exists public.income_entry_number_seq (
  company_id uuid primary key references public.companies (id) on delete cascade,
  last_value int not null default 0
);

alter table public.income_entries
  add column if not exists entry_number int;

-- Backfill i den rækkefølge indtægterne hører hjemme i regnskabet. Periodelåsen
-- blokerer UPDATE på indtægter i låste perioder, så den slås fra imens — vi ændrer
-- kun nummeret, ikke regnskabsdata.
alter table public.income_entries disable trigger income_entries_block_locked_period;

with numbered as (
  select
    id,
    row_number() over (
      partition by company_id
      order by entry_date, created_at, id
    ) as rn
  from public.income_entries
  where entry_number is null
)
update public.income_entries e
  set entry_number = n.rn
  from numbered n
  where e.id = n.id;

alter table public.income_entries enable trigger income_entries_block_locked_period;

insert into public.income_entry_number_seq (company_id, last_value)
select company_id, max(entry_number)
from public.income_entries
where entry_number is not null
group by company_id
on conflict (company_id) do update
  set last_value = greatest(public.income_entry_number_seq.last_value, excluded.last_value);

create unique index if not exists income_entries_company_number_key
  on public.income_entries (company_id, entry_number);

alter table public.income_entries
  alter column entry_number set not null;

create or replace function public.income_entries_assign_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  -- Eksplicit nummer (fx historisk import) respekteres; serien rykkes frem,
  -- så næste automatiske nummer ikke kolliderer.
  if new.entry_number is not null then
    insert into public.income_entry_number_seq (company_id, last_value)
    values (new.company_id, new.entry_number)
    on conflict (company_id) do update
      set last_value = greatest(public.income_entry_number_seq.last_value, excluded.last_value);
    return new;
  end if;

  insert into public.income_entry_number_seq (company_id, last_value)
  values (
    new.company_id,
    coalesce(
      (select max(entry_number) from public.income_entries where company_id = new.company_id),
      0
    ) + 1
  )
  on conflict (company_id) do update
    set last_value = public.income_entry_number_seq.last_value + 1
  returning last_value into v_next;

  new.entry_number := v_next;
  return new;
end;
$$;

-- Kører før income_entries_block_locked_period (triggere med samme timing kaldes i
-- navnerækkefølge, og «as» < «bl»), så nummeret er sat inden periodetjekket.
drop trigger if exists income_entries_assign_number on public.income_entries;
create trigger income_entries_assign_number
  before insert on public.income_entries
  for each row execute function public.income_entries_assign_number();

alter table public.income_entry_number_seq enable row level security;

-- Samme opdeling som voucher_number_seq: alle medlemmer må læse, men kun skrivende
-- roller må ændre tælleren. Ellers kunne et menigt medlem sætte last_value ned,
-- hvorefter unique-indekset blokerer al oprettelse af indtægter.
drop policy if exists "Members read income entry seq" on public.income_entry_number_seq;
create policy "Members read income entry seq" on public.income_entry_number_seq for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists "Writers write income entry seq" on public.income_entry_number_seq;
create policy "Writers write income entry seq" on public.income_entry_number_seq for all
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

comment on column public.income_entries.entry_number is
  'Fortløbende indtægtsnummer pr. virksomhed. Tildeles automatisk ved oprettelse og genbruges ikke.';
comment on table public.income_entry_number_seq is
  'Sidst brugte indtægtsnummer pr. virksomhed.';

notify pgrst, 'reload schema';

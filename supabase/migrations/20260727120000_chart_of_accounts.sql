-- Kontoplan — fundamentet for rigtig bogføring.
--
-- Indtil nu har den eneste kontering været `vouchers.category`: 12 frie danske
-- labels uden ID'er, og fakturaer har slet ingen kontering. Det kan der hverken
-- laves balance, saldobalance eller årsrapport ud fra.
--
-- Konti slås op i kode via `system_key`, ikke kontonummer. Så kan en virksomhed
-- omnummerere sin kontoplan efter sin revisors ønske uden at knække
-- posteringslogikken.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_no int not null check (account_no between 1 and 99999),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  -- Momskode der foreslås, når der konteres på denne konto.
  default_vat_code text references public.vat_codes (code),
  -- Stabilt håndtag til de konti appen selv posterer på. null for almindelige konti.
  system_key text check (system_key is null or system_key in (
    'debtors',
    'creditors',
    'bank',
    'cash',
    'vat_input',
    'vat_output',
    'vat_settlement',
    'retained_earnings',
    'profit_current_year',
    'owner_current_account',
    'suspense'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, account_no)
);

-- Hver system_key må kun findes én gang pr. virksomhed, ellers er opslaget tvetydigt.
create unique index if not exists accounts_company_system_key_idx
  on public.accounts (company_id, system_key)
  where system_key is not null;

create index if not exists accounts_company_type_idx
  on public.accounts (company_id, type)
  where is_active;

alter table public.accounts enable row level security;

drop policy if exists "Members read accounts" on public.accounts;
create policy "Members read accounts" on public.accounts for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists "Writers insert accounts" on public.accounts;
create policy "Writers insert accounts" on public.accounts for insert
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

drop policy if exists "Writers update accounts" on public.accounts;
create policy "Writers update accounts" on public.accounts for update
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

drop policy if exists "Writers delete accounts" on public.accounts;
create policy "Writers delete accounts" on public.accounts for delete
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

-- Dansk standardkontoplan. Idempotent: eksisterende kontonumre røres ikke, så en
-- virksomhed der har omdøbt en konto beholder sit navn.
create or replace function public.seed_default_chart_of_accounts(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- Kaldes både fra create_company_with_owner (med auth.uid() sat) og fra
  -- migrationer/service-role (uden). Rollecheck kun i brugerkontekst.
  if auth.uid() is not null
     and not public.has_company_role(p_company_id, array['owner', 'manager', 'bookkeeper']) then
    raise exception 'Ingen adgang til denne virksomhed';
  end if;

  insert into public.accounts (company_id, account_no, name, type, default_vat_code, system_key)
  values
    -- Omsætning
    (p_company_id, 1000, 'Omsætning',                    'revenue',   'U25',  null),
    (p_company_id, 1010, 'Salg af varer',                'revenue',   'U25',  null),
    (p_company_id, 1020, 'Salg af ydelser',              'revenue',   'U25',  null),
    (p_company_id, 1100, 'Tilskud og bevillinger',       'revenue',   'NONE', null),
    (p_company_id, 1110, 'Medlemskontingent',            'revenue',   'NONE', null),
    (p_company_id, 1120, 'Donationer',                   'revenue',   'NONE', null),
    -- Vareforbrug
    (p_company_id, 2000, 'Vareforbrug',                  'expense',   'I25',  null),
    (p_company_id, 2010, 'Fremmed arbejde',              'expense',   'I25',  null),
    (p_company_id, 2020, 'Materialer',                   'expense',   'I25',  null),
    -- Salgs- og kapacitetsomkostninger
    (p_company_id, 3010, 'Marketing og annoncering',     'expense',   'I25',  null),
    (p_company_id, 3020, 'Repræsentation',               'expense',   'IREP', null),
    (p_company_id, 3025, 'Mad og drikke',                'expense',   'I25R', null),
    (p_company_id, 3030, 'Rejse og ophold',              'expense',   'I25H', null),
    (p_company_id, 3040, 'Transport',                    'expense',   'I25',  null),
    -- Personale
    (p_company_id, 4010, 'Lønninger',                    'expense',   'NONE', null),
    (p_company_id, 4020, 'Pension og ATP',               'expense',   'NONE', null),
    -- Lokale
    (p_company_id, 5010, 'Husleje og lokaleleje',        'expense',   'I25',  null),
    (p_company_id, 5020, 'El, vand og varme',            'expense',   'I25',  null),
    -- Administration
    (p_company_id, 5500, 'Administration',               'expense',   'I25',  null),
    (p_company_id, 5510, 'Kontorartikler',               'expense',   'I25',  null),
    (p_company_id, 5520, 'IT og software',               'expense',   'I25',  null),
    (p_company_id, 5530, 'Telefon og internet',          'expense',   'I25',  null),
    (p_company_id, 5540, 'Forsikring',                   'expense',   'NONE', null),
    (p_company_id, 5550, 'Revisor og advokat',           'expense',   'I25',  null),
    (p_company_id, 5560, 'Gebyrer',                      'expense',   'NONE', null),
    (p_company_id, 5590, 'Andre omkostninger',           'expense',   'I25',  null),
    -- Afskrivninger, renter og skat
    (p_company_id, 6000, 'Af- og nedskrivninger',        'expense',   'NONE', null),
    (p_company_id, 7000, 'Renteindtægter',               'revenue',   'NONE', null),
    (p_company_id, 7010, 'Renteomkostninger',            'expense',   'NONE', null),
    (p_company_id, 7500, 'Selskabsskat',                 'expense',   'NONE', null),
    -- Aktiver
    (p_company_id, 10000, 'Driftsmidler og inventar',    'asset',     'NONE', null),
    (p_company_id, 10100, 'Akkumulerede afskrivninger',  'asset',     'NONE', null),
    (p_company_id, 12000, 'Varelager',                   'asset',     'NONE', null),
    (p_company_id, 13000, 'Debitorer',                   'asset',     'NONE', 'debtors'),
    (p_company_id, 13500, 'Andre tilgodehavender',       'asset',     'NONE', null),
    (p_company_id, 14000, 'Købsmoms',                    'asset',     'NONE', 'vat_input'),
    (p_company_id, 15000, 'Bank',                        'asset',     'NONE', 'bank'),
    (p_company_id, 15500, 'Kasse',                       'asset',     'NONE', 'cash'),
    (p_company_id, 19000, 'Fejlkonto',                   'asset',     'NONE', 'suspense'),
    -- Egenkapital
    (p_company_id, 20000, 'Egenkapital',                 'equity',    'NONE', null),
    (p_company_id, 20100, 'Overført resultat',           'equity',    'NONE', 'retained_earnings'),
    (p_company_id, 20200, 'Årets resultat',              'equity',    'NONE', 'profit_current_year'),
    -- Gæld
    (p_company_id, 22000, 'Kreditorer',                  'liability', 'NONE', 'creditors'),
    (p_company_id, 23000, 'Salgsmoms',                   'liability', 'NONE', 'vat_output'),
    (p_company_id, 23100, 'Momsafregning',               'liability', 'NONE', 'vat_settlement'),
    (p_company_id, 23500, 'Skyldig A-skat og AM-bidrag', 'liability', 'NONE', null),
    (p_company_id, 24000, 'Skyldige omkostninger',       'liability', 'NONE', null),
    (p_company_id, 24500, 'Feriepengeforpligtelse',      'liability', 'NONE', null),
    (p_company_id, 25000, 'Mellemregning med ejer',      'liability', 'NONE', 'owner_current_account'),
    (p_company_id, 26000, 'Gæld til pengeinstitut',      'liability', 'NONE', null)
  on conflict (company_id, account_no) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.seed_default_chart_of_accounts(uuid) to authenticated;

-- Nye virksomheder får kontoplanen med det samme.
create or replace function public.create_company_with_owner(
  p_name text,
  p_cvr text default null,
  p_entity_type text default 'virksomhed'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
  v_cvr text := nullif(trim(coalesce(p_cvr, '')), '');
  v_entity_type text := lower(coalesce(nullif(trim(p_entity_type), ''), 'virksomhed'));
  v_email text;
begin
  if v_user_id is null then
    raise exception 'Ikke logget ind';
  end if;

  if v_name is null then
    raise exception 'Virksomhedsnavn mangler';
  end if;

  if v_entity_type not in ('virksomhed', 'forening') then
    v_entity_type := 'virksomhed';
  end if;

  -- Standard faktura-e-mail = den e-mail brugeren oprettede sig med.
  select nullif(trim(email), '') into v_email from auth.users where id = v_user_id;

  insert into public.companies (name, cvr, entity_type, invoice_email)
  values (v_name, v_cvr, v_entity_type, v_email)
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner')
  on conflict (company_id, user_id) do update set role = 'owner';

  update public.profiles
  set current_company_id = v_company_id
  where id = v_user_id;

  -- Efter medlemskabet, så rollechecket i seed-funktionen går igennem.
  perform public.seed_default_chart_of_accounts(v_company_id);

  return v_company_id;
end;
$$;

grant execute on function public.create_company_with_owner(text, text, text) to authenticated;

-- Backfill: alle eksisterende virksomheder får standardkontoplanen.
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.seed_default_chart_of_accounts(r.id);
  end loop;
end;
$$;

comment on table public.accounts is
  'Kontoplan pr. virksomhed. Konti appen selv posterer på findes via system_key, ikke kontonummer.';
comment on column public.accounts.system_key is
  'Stabilt håndtag til systemkonti (debitorer, kreditorer, bank, moms m.v.). Unik pr. virksomhed. null for almindelige konti.';
comment on column public.accounts.default_vat_code is
  'Momskode der foreslås ved kontering på kontoen. Fx IREP på Repræsentation, NONE på Forsikring og Gebyrer, som er momsfri.';
comment on function public.seed_default_chart_of_accounts(uuid) is
  'Opretter dansk standardkontoplan for en virksomhed. Idempotent — eksisterende kontonumre røres ikke.';

notify pgrst, 'reload schema';

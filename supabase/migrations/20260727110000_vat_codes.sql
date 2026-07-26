-- Momskoder — grundlaget for korrekt momsbehandling og momsangivelse.
--
-- I dag findes kun `vat_rate numeric` på bilag og fakturalinjer. Det er ikke nok:
-- to bilag med 25% moms kan have vidt forskellig fradragsret. Restaurationsbesøg
-- giver 25% momsfradrag, repræsentation giver 0%, hotel giver 100%. Den forskel
-- kan ikke udtrykkes med en sats alene, og det er præcis den beslutning der skal
-- træffes pr. bilag.
--
-- Tabellen er GLOBAL (ingen company_id): momsreglerne er de samme for alle danske
-- virksomheder. Alle godkendte brugere kan læse; ingen kan skrive via API'et —
-- ændringer sker kun via migrationer.
--
-- OBS: satser og fradragsprocenter skal verificeres mod gældende lovgivning før
-- de bruges til faktisk indberetning. De justeres politisk.

create table if not exists public.vat_codes (
  -- Kort kode brugt i UI og på posteringslinjer, fx 'I25R'.
  code text primary key,
  name text not null check (length(trim(name)) > 0),
  -- Om koden hører til salg (udgående moms), køb (indgående) eller ingen af delene.
  direction text not null check (direction in ('sales', 'purchase', 'none')),
  rate numeric(5, 2) not null default 0 check (rate >= 0 and rate <= 100),
  -- Hvor stor en andel af momsen der er fradragsberettiget. Kun relevant for køb.
  -- 100 = fuldt fradrag, 25 = restaurationsmoms, 0 = repræsentation.
  -- Den ikke-fradragsberettigede del skal lægges på udgiftskontoen ved postering.
  deductible_pct numeric(5, 2) not null default 100
    check (deductible_pct >= 0 and deductible_pct <= 100),
  -- Omvendt betalingspligt: køber afregner momsen, sælger fakturerer uden.
  reverse_charge boolean not null default false,
  -- Hvilken rubrik på momsangivelsen beløbet skal tælle med i. Forbereder
  -- momsangivelsen; bruges ikke endnu.
  vat_return_box text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create index if not exists vat_codes_direction_idx
  on public.vat_codes (direction, sort_order)
  where is_active;

alter table public.vat_codes enable row level security;

drop policy if exists "Authenticated read vat codes" on public.vat_codes;
create policy "Authenticated read vat codes" on public.vat_codes for select
  to authenticated using (true);

-- Ingen insert/update/delete-policy: tabellen er skrivebeskyttet via API'et.
grant select on public.vat_codes to authenticated;

-- Standardkoder. `do update` frem for `do nothing`, så en senere migration kan
-- rette en sats ved blot at ændre værdien her.
insert into public.vat_codes
  (code, name, direction, rate, deductible_pct, reverse_charge, vat_return_box, sort_order)
values
  -- Salg
  ('U25',  'Salgsmoms 25%',                    'sales',     25,   100, false, 'salgsmoms',        10),
  ('U0',   'Momsfrit salg',                    'sales',      0,   100, false, null,               20),
  ('UEUV', 'EU-varesalg (rubrik B varer)',     'sales',      0,   100, true,  'rubrik_b_varer',   30),
  ('UEUY', 'EU-ydelsessalg (rubrik B ydelser)','sales',      0,   100, true,  'rubrik_b_ydelser', 40),
  ('UEX',  'Eksport uden for EU (rubrik C)',   'sales',      0,   100, false, 'rubrik_c',         50),
  -- Køb
  ('I25',  'Købsmoms 25%',                     'purchase',  25,   100, false, 'koebsmoms',       110),
  ('I25R', 'Restaurationsmoms (25% fradrag)',  'purchase',  25,    25, false, 'koebsmoms',       120),
  ('I25H', 'Hotelmoms (fuldt fradrag)',        'purchase',  25,   100, false, 'koebsmoms',       130),
  ('IREP', 'Repræsentation (intet momsfradrag)','purchase', 25,     0, false, null,              140),
  ('IEUV', 'EU-varekøb (rubrik A varer)',      'purchase',  25,   100, true,  'rubrik_a_varer',  150),
  ('IEUY', 'EU-ydelseskøb (rubrik A ydelser)', 'purchase',  25,   100, true,  'rubrik_a_ydelser',160),
  ('IRC',  'Omvendt betalingspligt, indland',  'purchase',  25,   100, true,  'koebsmoms',       170),
  ('I0',   'Køb uden moms',                    'purchase',   0,   100, false, null,              180),
  -- Neutral
  ('NONE', 'Uden for momsområdet',             'none',       0,     0, false, null,              900)
on conflict (code) do update set
  name           = excluded.name,
  direction      = excluded.direction,
  rate           = excluded.rate,
  deductible_pct = excluded.deductible_pct,
  reverse_charge = excluded.reverse_charge,
  vat_return_box = excluded.vat_return_box,
  sort_order     = excluded.sort_order;

comment on table public.vat_codes is
  'Globale danske momskoder. Skrivebeskyttet via API — ændres kun via migrationer.';
comment on column public.vat_codes.deductible_pct is
  'Fradragsberettiget andel af momsen i procent. 25 for restauration, 0 for repræsentation, 100 ellers. Resten lægges på udgiftskontoen.';
comment on column public.vat_codes.reverse_charge is
  'Omvendt betalingspligt — køber afregner momsen. Gælder EU-handel og visse indenlandske ydelser.';
comment on column public.vat_codes.vat_return_box is
  'Rubrik på momsangivelsen. Forbereder momsindberetning; bruges ikke endnu.';

notify pgrst, 'reload schema';

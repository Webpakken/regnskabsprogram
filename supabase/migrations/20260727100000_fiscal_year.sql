-- Regnskabsår på virksomhedsniveau.
--
-- Indtil nu har hele appen antaget kalenderår: ResultatPage og VatPage har
-- hårdkodet Q1 = 01-01→03-31 osv. Det holder ikke for selskaber med forskudt
-- regnskabsår (fx 1. juli → 30. juni), og det er en forudsætning for balance,
-- primo/ultimo og årsafslutning.
--
-- Vi gemmer kun startmåneden. Danske regnskabsår starter altid den 1. i en
-- måned og varer 12 måneder (undtagen omlægningsår, som håndteres manuelt).

alter table public.companies
  add column if not exists fiscal_year_start_month smallint not null default 1
    check (fiscal_year_start_month between 1 and 12);

-- Hvilket regnskabsår ligger p_date i? Returnerer første og sidste dag.
-- Ukendt virksomhed falder tilbage til kalenderår i stedet for at fejle —
-- samme princip som is_period_locked(), der aldrig blokerer på ukendt firma.
create or replace function public.fiscal_year_bounds(
  p_company_id uuid,
  p_date date default current_date
)
returns table (starts_on date, ends_on date)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(
      (select c.fiscal_year_start_month from public.companies c where c.id = p_company_id),
      1
    )::int as start_month
  ),
  candidate as (
    select make_date(extract(year from p_date)::int, cfg.start_month, 1) as d
    from cfg
  ),
  resolved as (
    -- Kolonnen må ikke hedde starts_on: det er navnet på en OUT-parameter, og
    -- SQL-funktioner opløser ukvalificerede navne til parametre først.
    select case
             when p_date >= candidate.d then candidate.d
             else (candidate.d - interval '1 year')::date
           end as fy_start
    from candidate
  )
  select r.fy_start, (r.fy_start + interval '1 year' - interval '1 day')::date
  from resolved r;
$$;

grant execute on function public.fiscal_year_bounds(uuid, date) to authenticated;

comment on column public.companies.fiscal_year_start_month is
  'Regnskabsårets startmåned (1-12). 1 = kalenderår. Bruges af fiscal_year_bounds().';
comment on function public.fiscal_year_bounds(uuid, date) is
  'Første og sidste dag i det regnskabsår som p_date falder i. Falder tilbage til kalenderår for ukendt virksomhed.';

notify pgrst, 'reload schema';

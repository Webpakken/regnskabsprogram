-- Tilføj "før pris" pr. plan, så vi kan vise overstreget tidligere pris ved siden af aktuel pris.
alter table public.billing_plans
  add column if not exists compare_price_cents int;

alter table public.billing_plans
  drop constraint if exists billing_plans_compare_price_check;

alter table public.billing_plans
  add constraint billing_plans_compare_price_check
  check (compare_price_cents is null or compare_price_cents >= 0);

comment on column public.billing_plans.compare_price_cents is
  'Valgfri tidligere pris vist overstreget før den aktuelle monthly_price_cents.';

notify pgrst, 'reload schema';

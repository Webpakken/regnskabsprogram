-- Eksplicit "hvilken plan får en kunde der trykker «Aktivér abonnement» uden
-- selv at vælge plan". Tidligere udledte stripe-checkout den af sort_order/pris
-- (billigste aktive betalte plan vandt), hvilket betød at tilføjelsen af en
-- billigere plan utilsigtet sænkede prisen for alle nye og re-tilmeldte kunder.

alter table public.billing_plans
  add column if not exists is_default_signup boolean not null default false;

comment on column public.billing_plans.is_default_signup is
  'Planen stripe-checkout bruger når kunden ikke har valgt plan eksplicit og ikke har en låst pris. Højst én plan må have true.';

-- Hold invarianten "højst én default" uanset om den sættes fra platform-UI'et,
-- en migration eller ad-hoc SQL: triggeren rydder de øvrige, indekset fanger
-- resten hvis triggeren nogensinde bliver droppet.
create or replace function public.billing_plans_single_default_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.billing_plans
    set is_default_signup = false, updated_at = now()
    where id <> new.id and is_default_signup;
  return new;
end;
$$;

drop trigger if exists billing_plans_single_default_signup on public.billing_plans;
create trigger billing_plans_single_default_signup
  before insert or update of is_default_signup on public.billing_plans
  for each row when (new.is_default_signup)
  execute function public.billing_plans_single_default_signup();

create unique index if not exists billing_plans_one_default_signup
  on public.billing_plans (is_default_signup)
  where is_default_signup;

-- Pro er den listepris appen og landingpage annoncerer (99 kr./md.), og den
-- plan marketing-siden fremhæver. Den er derfor default for nye tilmeldinger.
update public.billing_plans
  set is_default_signup = true, updated_at = now()
  where slug = 'pro';

-- Prøveperiode: lagret slut-override (så platform-ejeren kan forlænge), og
-- sporing af de 3 påmindelses-mails der sendes efter udløb uden betaling.

alter table public.companies
  -- Override af den ellers beregnede slutdato (created_at + 30 dage). null = beregn.
  add column if not exists trial_ends_at timestamptz,
  -- Hvor mange af de 3 påmindelser der er sendt (0→3). Nulstilles når kunden betaler/forlænges.
  add column if not exists trial_reminder_stage smallint not null default 0
    check (trial_reminder_stage >= 0 and trial_reminder_stage <= 3),
  add column if not exists trial_reminder_last_sent_at timestamptz;

-- Platform-staff forlænger en virksomheds prøveperiode med p_days dage.
-- Forlænger fra den seneste af (nuværende effektive slutdato, nu) + p_days, så en
-- allerede udløbet trial forlænges fra i dag, og en aktiv fra dens nuværende slut.
create or replace function public.extend_company_trial(p_company_id uuid, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_current_end timestamptz;
  v_new_end timestamptz;
begin
  if not public.is_platform_staff() then
    raise exception 'not authorized';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'p_days skal være et positivt antal dage';
  end if;

  select created_at, trial_ends_at into v_created, v_current_end
  from public.companies where id = p_company_id;
  if v_created is null then
    raise exception 'company not found';
  end if;

  v_new_end := greatest(coalesce(v_current_end, v_created + interval '30 days'), now())
               + make_interval(days => p_days);

  update public.companies
  set trial_ends_at = v_new_end,
      trial_reminder_stage = 0,
      trial_reminder_last_sent_at = null,
      updated_at = now()
  where id = p_company_id;

  -- Hold Stripe/DB-abonnementet i sync så subscriptionOk + entitlements også følger med.
  update public.subscriptions
  set status = 'trialing',
      current_period_end = v_new_end,
      updated_at = now()
  where company_id = p_company_id;

  return v_new_end;
end;
$$;

grant execute on function public.extend_company_trial(uuid, int) to authenticated;

notify pgrst, 'reload schema';

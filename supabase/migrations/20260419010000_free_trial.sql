-- Bilago: 30-day free trial for every new company

-- Auto-provision a trialing subscription when a company is created
create or replace function public.provision_trial_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (company_id, status, current_period_end)
  values (new.id, 'trialing', now() + interval '30 days')
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_company_provision_trial on public.companies;
create trigger on_company_provision_trial
  after insert on public.companies
  for each row execute function public.provision_trial_subscription();

-- Backfill: any existing company without a subscription gets a trial
insert into public.subscriptions (company_id, status, current_period_end)
select c.id, 'trialing', now() + interval '30 days'
from public.companies c
left join public.subscriptions s on s.company_id = c.id
where s.company_id is null;

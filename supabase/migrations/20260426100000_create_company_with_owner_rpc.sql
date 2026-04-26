-- Opret virksomhed atomisk fra onboarding.
-- Undgår at browseren først skal indsætte i companies og derefter company_members,
-- hvilket kan ramme RLS i mellemrummet.

create or replace function public.create_company_with_owner(p_name text, p_cvr text default null)
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
begin
  if v_user_id is null then
    raise exception 'Ikke logget ind';
  end if;

  if v_name is null then
    raise exception 'Virksomhedsnavn mangler';
  end if;

  insert into public.companies (name, cvr)
  values (v_name, v_cvr)
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner')
  on conflict (company_id, user_id) do update set role = 'owner';

  update public.profiles
  set current_company_id = v_company_id
  where id = v_user_id;

  return v_company_id;
end;
$$;

grant execute on function public.create_company_with_owner(text, text) to authenticated;

-- Behold den direkte insert-policy som fallback for eksisterende klienter.
drop policy if exists "Authenticated create company" on public.companies;
create policy "Authenticated create company" on public.companies for insert
  with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';

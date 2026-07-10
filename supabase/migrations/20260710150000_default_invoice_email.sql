-- Faktura-e-mail skal som standard være den e-mail ejeren oprettede sig med,
-- medmindre de selv angiver noget andet i Indstillinger → Faktura.
--
-- 1) create_company_with_owner sætter invoice_email = ejerens auth-email ved oprettelse.
-- 2) Backfill: eksisterende virksomheder uden invoice_email får ejerens signup-email.

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

  return v_company_id;
end;
$$;

grant execute on function public.create_company_with_owner(text, text, text) to authenticated;

-- Backfill: virksomheder uden faktura-e-mail får ejerens signup-email (tidligste ejer).
update public.companies c
set invoice_email = sub.email
from (
  select distinct on (m.company_id)
    m.company_id,
    nullif(trim(u.email), '') as email
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.role = 'owner'
  order by m.company_id, m.created_at asc
) sub
where sub.company_id = c.id
  and sub.email is not null
  and (c.invoice_email is null or trim(c.invoice_email) = '');

notify pgrst, 'reload schema';

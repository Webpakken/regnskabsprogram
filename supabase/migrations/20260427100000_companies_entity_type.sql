-- Skelner mellem virksomheder og foreninger på companies-niveau.
-- Bruges fremadrettet til at vise/skjule UI (fx moms-fane for foreninger) og til
-- at registrere forenings-specifikke indtægter (tilskud, bevillinger).

alter table public.companies
  add column if not exists entity_type text not null default 'virksomhed'
    check (entity_type in ('virksomhed', 'forening'));

comment on column public.companies.entity_type is
  'Type af entitet: virksomhed eller forening. Auto-detekteres typisk fra CVR-virksomhedsform ved oprettelse.';

-- Udvid create_company_with_owner så onboarding kan sætte typen atomisk.
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

  insert into public.companies (name, cvr, entity_type)
  values (v_name, v_cvr, v_entity_type)
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

notify pgrst, 'reload schema';

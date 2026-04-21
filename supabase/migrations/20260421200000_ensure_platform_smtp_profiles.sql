-- Sikr de tre SMTP-profilrækker, så platform kan udfylde host/bruger/from (adgangskode ikke i DB).

insert into public.platform_smtp_profiles (id, label) values
  ('transactional', 'Faktura og kundemails'),
  ('platform', 'Support og system'),
  ('marketing', 'Nyhedsbrev og opdateringer')
on conflict (id) do nothing;

-- Kald fra app hvis tabellen af en grund er tom (platform-staff kun).
create or replace function public.ensure_platform_smtp_profiles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'forbidden';
  end if;
  insert into public.platform_smtp_profiles (id, label) values
    ('transactional', 'Faktura og kundemails'),
    ('platform', 'Support og system'),
    ('marketing', 'Nyhedsbrev og opdateringer')
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_platform_smtp_profiles() to authenticated;

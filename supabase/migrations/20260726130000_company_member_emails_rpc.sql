-- Medlemmer-siden skal vise e-mail på hvert medlem. auth.users er ikke læsbar fra
-- klienten, så vi eksponerer den via en security definer-funktion der kun svarer,
-- hvis kalderen selv er medlem af det pågældende firma.
create or replace function public.list_company_member_emails(p_company_id uuid)
returns table (
  user_id uuid,
  email text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select cm.user_id, u.email::text
  from public.company_members cm
  inner join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company_id
    and exists (
      select 1
      from public.company_members me
      where me.company_id = p_company_id
        and me.user_id = auth.uid()
    );
$$;

grant execute on function public.list_company_member_emails(uuid) to authenticated;

comment on function public.list_company_member_emails(uuid) is
  'Returnerer user_id + e-mail for firmaets medlemmer; kun kaldbar af et medlem af samme firma.';

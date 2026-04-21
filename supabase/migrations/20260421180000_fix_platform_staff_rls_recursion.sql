-- Undgå "infinite recursion" på platform_staff: EXISTS(...) i policies genindlæser samme tabel under RLS.
-- Brug security definer-funktioner der læser platform_staff uden rekursiv policy-evaluering.

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff where user_id = auth.uid()
  );
$$;

create or replace function public.is_platform_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and role = 'superadmin'
  );
$$;

grant execute on function public.is_platform_staff() to authenticated;
grant execute on function public.is_platform_superadmin() to authenticated;

drop policy if exists "Platform staff read staff" on public.platform_staff;
drop policy if exists "Users read own platform_staff row" on public.platform_staff;

create policy "Platform staff select rows" on public.platform_staff
  for select
  using (public.is_platform_staff());

drop policy if exists "Superadmin insert staff" on public.platform_staff;

create policy "Superadmin insert staff" on public.platform_staff
  for insert
  with check (public.is_platform_superadmin());

drop policy if exists "Superadmin delete staff" on public.platform_staff;

create policy "Superadmin delete staff" on public.platform_staff
  for delete
  using (
    public.is_platform_superadmin()
    and user_id <> auth.uid()
  );

-- Fix: superadmin/staff kunne ikke læse egen række i platform_staff (høne-og-æg med EXISTS-politik).
-- Tillad altid SELECT på egen række, så AppProvider kan sætte platformRole.

create policy "Users read own platform_staff row" on public.platform_staff
  for select
  using (user_id = auth.uid());

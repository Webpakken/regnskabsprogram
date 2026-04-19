-- Bilago: expand role model from owner/member to owner/manager/bookkeeper/accountant

-- Replace CHECK constraint + backfill existing members
alter table public.company_members drop constraint if exists company_members_role_check;

update public.company_members set role = 'bookkeeper' where role = 'member';

alter table public.company_members
  alter column role set default 'bookkeeper';

alter table public.company_members
  add constraint company_members_role_check
  check (role in ('owner', 'manager', 'bookkeeper', 'accountant'));

-- Helper: does current user have one of the given roles in the company?
create or replace function public.has_company_role(p_company_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role = any(p_roles)
  );
$$;

grant execute on function public.has_company_role(uuid, text[]) to authenticated;

-- Convenience arrays as constants via functions are awkward; we list roles inline below.

-- Companies: owner + manager can update
drop policy if exists "Owners update company" on public.companies;
create policy "Admins update company" on public.companies for update
  using (public.has_company_role(id, array['owner', 'manager']));

-- Company members: owner-only writes (except self-insert to bootstrap)
drop policy if exists "Members insert rules" on public.company_members;

create policy "Owner or self insert members" on public.company_members for insert
  with check (
    user_id = auth.uid()
    or public.has_company_role(company_id, array['owner'])
  );

create policy "Owners update members" on public.company_members for update
  using (public.has_company_role(company_id, array['owner']))
  with check (public.has_company_role(company_id, array['owner']));

create policy "Owners delete members" on public.company_members for delete
  using (public.has_company_role(company_id, array['owner']));

-- Bank connections: owner + manager can write; all members read
drop policy if exists "Members insert bank" on public.bank_connections;
drop policy if exists "Members update bank" on public.bank_connections;

create policy "Admins insert bank" on public.bank_connections for insert
  with check (public.has_company_role(company_id, array['owner', 'manager']));
create policy "Admins update bank" on public.bank_connections for update
  using (public.has_company_role(company_id, array['owner', 'manager']))
  with check (public.has_company_role(company_id, array['owner', 'manager']));

-- Invoices: writers (owner/manager/bookkeeper) write; all members read
drop policy if exists "Members crud invoices" on public.invoices;
create policy "Members read invoices" on public.invoices for select
  using (company_id in (select public.user_company_ids()));
create policy "Writers insert invoices" on public.invoices for insert
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));
create policy "Writers update invoices" on public.invoices for update
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));
create policy "Writers delete invoices" on public.invoices for delete
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

-- Line items (via invoice ownership)
drop policy if exists "Members crud line items" on public.invoice_line_items;
create policy "Members read line items" on public.invoice_line_items for select
  using (
    invoice_id in (
      select id from public.invoices where company_id in (select public.user_company_ids())
    )
  );
create policy "Writers insert line items" on public.invoice_line_items for insert
  with check (
    invoice_id in (
      select id from public.invoices
      where public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper'])
    )
  );
create policy "Writers update line items" on public.invoice_line_items for update
  using (
    invoice_id in (
      select id from public.invoices
      where public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper'])
    )
  )
  with check (
    invoice_id in (
      select id from public.invoices
      where public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper'])
    )
  );
create policy "Writers delete line items" on public.invoice_line_items for delete
  using (
    invoice_id in (
      select id from public.invoices
      where public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper'])
    )
  );

-- Vouchers
drop policy if exists "Members crud vouchers" on public.vouchers;
create policy "Members read vouchers" on public.vouchers for select
  using (company_id in (select public.user_company_ids()));
create policy "Writers insert vouchers" on public.vouchers for insert
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));
create policy "Writers update vouchers" on public.vouchers for update
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));
create policy "Writers delete vouchers" on public.vouchers for delete
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

-- Activity events: all read, writers write
drop policy if exists "Members insert activity" on public.activity_events;
create policy "Writers insert activity" on public.activity_events for insert
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

-- Invoice number seq
drop policy if exists "Members seq" on public.invoice_number_seq;
create policy "Members read seq" on public.invoice_number_seq for select
  using (company_id in (select public.user_company_ids()));
create policy "Writers write seq" on public.invoice_number_seq for all
  using (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']))
  with check (public.has_company_role(company_id, array['owner', 'manager', 'bookkeeper']));

-- Pending invites: owner invites email + role; claimed automatically on signup
create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'bookkeeper', 'accountant')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, lower(email))
);

create index pending_invites_email_idx on public.pending_invites (lower(email));

alter table public.pending_invites enable row level security;

create policy "Owners read invites" on public.pending_invites for select
  using (public.has_company_role(company_id, array['owner']));
create policy "Owners create invites" on public.pending_invites for insert
  with check (public.has_company_role(company_id, array['owner']));
create policy "Owners delete invites" on public.pending_invites for delete
  using (public.has_company_role(company_id, array['owner']));

-- On signup, claim any pending invites matching the email
create or replace function public.claim_pending_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv record;
begin
  for inv in
    select * from public.pending_invites
    where lower(email) = lower(new.email)
  loop
    insert into public.company_members (company_id, user_id, role)
    values (inv.company_id, new.id, inv.role)
    on conflict (company_id, user_id) do nothing;

    delete from public.pending_invites where id = inv.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_auth_user_claim_invites on auth.users;
create trigger on_auth_user_claim_invites
  after insert on auth.users
  for each row execute function public.claim_pending_invites();

-- Storage: tighten vouchers bucket so only writers can upload/update/delete
drop policy if exists "Members upload vouchers storage" on storage.objects;
drop policy if exists "Members update vouchers storage" on storage.objects;
drop policy if exists "Members delete vouchers storage" on storage.objects;

create policy "Writers upload vouchers storage"
on storage.objects for insert
with check (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

create policy "Writers update vouchers storage"
on storage.objects for update
using (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

create policy "Writers delete vouchers storage"
on storage.objects for delete
using (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members
    where user_id = auth.uid() and role in ('owner', 'manager', 'bookkeeper')
  )
);

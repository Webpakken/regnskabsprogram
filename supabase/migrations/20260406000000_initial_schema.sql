-- Bilago MVP: multi-tenant accounting-lite schema with RLS
-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  current_company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cvr text,
  base_currency text not null default 'DKK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_current_company_fk
  foreign key (current_company_id) references public.companies (id) on delete set null;

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members (user_id);
create index company_members_company_id_idx on public.company_members (company_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.invoice_number_seq (
  company_id uuid primary key references public.companies (id) on delete cascade,
  last_value int not null default 0
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_number text not null,
  customer_name text not null,
  customer_email text,
  issue_date date not null default (current_date),
  due_date date not null,
  currency text not null default 'DKK',
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled')),
  net_cents bigint not null default 0,
  vat_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  notes text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number)
);

create index invoices_company_id_idx on public.invoices (company_id);
create index invoices_issue_date_idx on public.invoices (issue_date);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(12, 4) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  vat_rate numeric(5, 2) not null default 25 check (vat_rate >= 0 and vat_rate <= 100),
  line_net_cents bigint not null,
  line_vat_cents bigint not null,
  line_gross_cents bigint not null,
  sort_order int not null default 0
);

create index invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime_type text,
  title text,
  category text,
  notes text,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index vouchers_company_id_idx on public.vouchers (company_id);

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null default 'aiia',
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  institution_name text,
  external_user_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_connections_company_id_idx on public.bank_connections (company_id);

-- Service-role only (no policies) — tokens never exposed to clients
create table public.bank_connection_secrets (
  connection_id uuid primary key references public.bank_connections (id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  raw_payload jsonb,
  updated_at timestamptz not null default now()
);

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  state text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_states_expires_idx on public.oauth_states (expires_at);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  title text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_company_created_idx on public.activity_events (company_id, created_at desc);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger bank_connections_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

-- Auto profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: companies current user belongs to
create or replace function public.user_company_ids()
returns setof uuid language sql stable security definer
set search_path = public as $$
  select company_id from public.company_members where user_id = auth.uid();
$$;

grant execute on function public.user_company_ids() to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.vouchers enable row level security;
alter table public.bank_connections enable row level security;
alter table public.activity_events enable row level security;
alter table public.invoice_number_seq enable row level security;

-- bank_connection_secrets & oauth_states: no client access
alter table public.bank_connection_secrets enable row level security;
alter table public.oauth_states enable row level security;

-- Profiles
create policy "Users read own profile" on public.profiles for select using (id = auth.uid());
create policy "Users update own profile" on public.profiles for update using (id = auth.uid());

-- Companies: members only
create policy "Members read company" on public.companies for select
  using (id in (select public.user_company_ids()));
create policy "Authenticated create company" on public.companies for insert
  with check (auth.role() = 'authenticated');

create policy "Owners update company" on public.companies for update
  using (
    id in (
      select company_id from public.company_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Company members
create policy "Members read memberships" on public.company_members for select
  using (company_id in (select public.user_company_ids()));
create policy "Users insert self as owner" on public.company_members for insert
  with check (user_id = auth.uid());
create policy "Owners add members" on public.company_members for insert
  with check (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Fix: two insert policies - actually for signup we need user to add themselves as owner when creating company.
-- Simpler: one policy — insert if user_id = auth.uid() OR you're owner of that company
drop policy if exists "Users insert self as owner" on public.company_members;
drop policy if exists "Owners add members" on public.company_members;

create policy "Members insert rules" on public.company_members for insert
  with check (
    user_id = auth.uid()
    or company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Subscriptions: members read, service role writes via dashboard — allow members to read only
create policy "Members read subscription" on public.subscriptions for select
  using (company_id in (select public.user_company_ids()));

-- Invoices
create policy "Members crud invoices" on public.invoices for all
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Line items via invoice ownership
create policy "Members crud line items" on public.invoice_line_items for all
  using (
    invoice_id in (
      select id from public.invoices where company_id in (select public.user_company_ids())
    )
  )
  with check (
    invoice_id in (
      select id from public.invoices where company_id in (select public.user_company_ids())
    )
  );

-- Vouchers
create policy "Members crud vouchers" on public.vouchers for all
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Bank connections
create policy "Members read bank" on public.bank_connections for select
  using (company_id in (select public.user_company_ids()));
create policy "Members insert bank" on public.bank_connections for insert
  with check (company_id in (select public.user_company_ids()));
create policy "Members update bank" on public.bank_connections for update
  using (company_id in (select public.user_company_ids()));

-- Activity
create policy "Members read activity" on public.activity_events for select
  using (company_id in (select public.user_company_ids()));
create policy "Members insert activity" on public.activity_events for insert
  with check (company_id in (select public.user_company_ids()));

-- Invoice number seq: members of company
create policy "Members seq" on public.invoice_number_seq for all
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Secrets: no access for authenticated JWT (service role bypasses RLS for Edge Functions)
create policy "secrets_no_select" on public.bank_connection_secrets for select to authenticated using (false);
create policy "secrets_no_write" on public.bank_connection_secrets for insert to authenticated with check (false);
create policy "secrets_no_update" on public.bank_connection_secrets for update to authenticated using (false) with check (false);
create policy "secrets_no_delete" on public.bank_connection_secrets for delete to authenticated using (false);

create policy "oauth_no_select" on public.oauth_states for select to authenticated using (false);
create policy "oauth_no_insert" on public.oauth_states for insert to authenticated with check (false);
create policy "oauth_no_update" on public.oauth_states for update to authenticated using (false) with check (false);
create policy "oauth_no_delete" on public.oauth_states for delete to authenticated using (false);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('vouchers', 'vouchers', false)
on conflict (id) do nothing;

create policy "Members read vouchers storage"
on storage.objects for select
using (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members where user_id = auth.uid()
  )
);

create policy "Members upload vouchers storage"
on storage.objects for insert
with check (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members where user_id = auth.uid()
  )
);

create policy "Members update vouchers storage"
on storage.objects for update
using (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members where user_id = auth.uid()
  )
);

create policy "Members delete vouchers storage"
on storage.objects for delete
using (
  bucket_id = 'vouchers'
  and split_part(name, '/', 1) in (
    select company_id::text from public.company_members where user_id = auth.uid()
  )
);

-- RPC: allocate invoice number (transactional)
create or replace function public.next_invoice_number(p_company_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_next int;
begin
  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  insert into public.invoice_number_seq (company_id, last_value)
  values (p_company_id, 1)
  on conflict (company_id) do update
    set last_value = public.invoice_number_seq.last_value + 1
  returning last_value into v_next;

  return to_char(v_next, 'FM000000');
end;
$$;

grant execute on function public.next_invoice_number(uuid) to authenticated;

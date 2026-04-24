-- Planer/priser og feature-entitlements.
-- MVP-princip: Stripe price_id binder betalingen til en plan, og plan_features styrer adgang/limits.

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  stripe_price_id text unique,
  monthly_price_cents int not null default 0,
  active boolean not null default true,
  is_default_free boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0),
  check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  check (monthly_price_cents >= 0)
);

create unique index if not exists billing_plans_single_default_free_idx
  on public.billing_plans (is_default_free)
  where is_default_free;

create index if not exists billing_plans_active_sort_idx
  on public.billing_plans (active, sort_order, name);

create table if not exists public.billing_features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key ~ '^[a-z0-9][a-z0-9_.-]*$'),
  check (length(trim(name)) > 0)
);

create index if not exists billing_features_active_sort_idx
  on public.billing_features (active, sort_order, name);

create table if not exists public.billing_plan_features (
  plan_id uuid not null references public.billing_plans (id) on delete cascade,
  feature_id uuid not null references public.billing_features (id) on delete cascade,
  enabled boolean not null default true,
  limit_value int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_id),
  check (limit_value is null or limit_value >= 0)
);

alter table public.subscriptions
  add column if not exists billing_plan_id uuid references public.billing_plans (id) on delete set null;

create index if not exists subscriptions_billing_plan_idx
  on public.subscriptions (billing_plan_id);

alter table public.billing_plans enable row level security;
alter table public.billing_features enable row level security;
alter table public.billing_plan_features enable row level security;

create or replace function public.is_platform_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_staff() to authenticated;

create or replace function public.is_platform_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;

grant execute on function public.is_platform_superadmin() to authenticated;

drop policy if exists "Authenticated read active billing plans" on public.billing_plans;
create policy "Authenticated read active billing plans" on public.billing_plans for select
  using (active or public.is_platform_staff());

drop policy if exists "Platform staff write billing plans" on public.billing_plans;
create policy "Platform staff write billing plans" on public.billing_plans for all
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

drop policy if exists "Authenticated read active billing features" on public.billing_features;
create policy "Authenticated read active billing features" on public.billing_features for select
  using (active or public.is_platform_staff());

drop policy if exists "Platform staff write billing features" on public.billing_features;
create policy "Platform staff write billing features" on public.billing_features for all
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

drop policy if exists "Authenticated read plan features" on public.billing_plan_features;
create policy "Authenticated read plan features" on public.billing_plan_features for select
  using (
    public.is_platform_staff()
    or plan_id in (select id from public.billing_plans where active)
  );

drop policy if exists "Platform staff write plan features" on public.billing_plan_features;
create policy "Platform staff write plan features" on public.billing_plan_features for all
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

insert into public.billing_plans (name, slug, description, monthly_price_cents, active, is_default_free, sort_order)
values
  ('Gratis', 'free', 'Startpakke med de vigtigste funktioner og lave limits.', 0, true, true, 10),
  ('Pro', 'pro', 'Alle centrale funktioner og højere/ubegrænsede limits.', 9900, true, false, 20)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.billing_features (key, name, description, sort_order)
values
  ('invoices', 'Fakturaer', 'Opret, send og følg betaling på fakturaer.', 10),
  ('vouchers', 'Bilag', 'Upload og scan bilag.', 20),
  ('voucher_projects', 'Events/projekter på bilag', 'Gruppér bilag på tværs af kategorier.', 30),
  ('bank', 'Bank', 'Bankforbindelse og afstemning.', 40),
  ('vat', 'Moms', 'Momsoversigt og rapportering.', 50),
  ('members', 'Medlemmer', 'Invitér bogholder, revisor eller medejere.', 60),
  ('invoice_automation', 'Automatiske påmindelser', 'Send automatiske betalingspåmindelser efter regler.', 70),
  ('ocr_scans', 'OCR-scanning', 'Automatisk læsning af bilag.', 80),
  ('support', 'Support', 'Skriv til support direkte i appen.', 90)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.billing_plan_features (plan_id, feature_id, enabled, limit_value)
select p.id, f.id, true,
  case
    when p.slug = 'free' and f.key = 'vouchers' then 20
    when p.slug = 'free' and f.key = 'ocr_scans' then 5
    else null
  end
from public.billing_plans p
join public.billing_features f on f.key in ('invoices', 'vouchers', 'ocr_scans', 'support')
where p.slug = 'free'
on conflict (plan_id, feature_id) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

insert into public.billing_plan_features (plan_id, feature_id, enabled, limit_value)
select p.id, f.id, true, null
from public.billing_plans p
join public.billing_features f on true
where p.slug = 'pro'
on conflict (plan_id, feature_id) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

create or replace function public.company_billing_plan_id(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with sub as (
    select *
    from public.subscriptions
    where company_id = p_company_id
    limit 1
  ),
  active_sub as (
    select *
    from sub
    where status = 'active'
       or (status = 'trialing' and (current_period_end is null or current_period_end > now()))
  ),
  chosen as (
    select bp.id, 1 as priority
    from active_sub s
    join public.billing_plans bp on bp.id = s.billing_plan_id and bp.active
    union all
    select bp.id, 2 as priority
    from active_sub s
    join public.billing_plans bp on bp.stripe_price_id = s.stripe_price_id and bp.active
    union all
    select bp.id, 3 as priority
    from active_sub s
    join public.billing_plans bp on bp.slug = 'pro' and bp.active
    union all
    select bp.id, 4 as priority
    from public.billing_plans bp
    where bp.is_default_free and bp.active
  )
  select id from chosen order by priority limit 1;
$$;

grant execute on function public.company_billing_plan_id(uuid) to authenticated;

create or replace function public.get_company_feature_entitlements(p_company_id uuid)
returns table (
  plan_id uuid,
  plan_slug text,
  plan_name text,
  feature_key text,
  feature_name text,
  enabled boolean,
  limit_value int
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select exists (
      select 1
      from public.company_members
      where company_id = p_company_id
        and user_id = auth.uid()
    ) or public.is_platform_staff() as ok
  ),
  plan as (
    select bp.*
    from public.billing_plans bp
    where bp.id = public.company_billing_plan_id(p_company_id)
      and (select ok from allowed)
  )
  select
    plan.id,
    plan.slug,
    plan.name,
    f.key,
    f.name,
    coalesce(pf.enabled, false),
    pf.limit_value
  from plan
  cross join public.billing_features f
  left join public.billing_plan_features pf
    on pf.plan_id = plan.id
   and pf.feature_id = f.id
  where f.active
  order by f.sort_order, f.name;
$$;

grant execute on function public.get_company_feature_entitlements(uuid) to authenticated;

comment on table public.billing_plans is
  'Abonnementsplaner/priser. stripe_price_id matcher Stripe Price for betalte planer.';
comment on table public.billing_features is
  'Central feature registry til adgangsstyring og planvisning.';
comment on table public.billing_plan_features is
  'Kobling mellem planer og features. limit_value null betyder ubegrænset/ikke relevant.';
comment on column public.subscriptions.billing_plan_id is
  'Valgfri direkte plan-kobling. Hvis null, bruges stripe_price_id eller fallback plan.';

notify pgrst, 'reload schema';

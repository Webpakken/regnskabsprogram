-- Platform admin notifikationsklokke: tracker hvornår super-admin sidst så hver kategori
-- (nye virksomheder, nye betalinger, nye support-beskeder), så vi kan vise tællere.
-- Kun rækker for brugere i platform_staff er meningsfulde — RLS låser tabellen til ejerne.

create table public.platform_admin_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  companies_seen_at timestamptz not null default now(),
  subscriptions_seen_at timestamptz not null default now(),
  support_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admin_seen enable row level security;

create policy "Own seen row read"
  on public.platform_admin_seen for select
  using (user_id = auth.uid() and public.is_platform_staff());

create policy "Own seen row upsert"
  on public.platform_admin_seen for insert
  with check (user_id = auth.uid() and public.is_platform_staff());

create policy "Own seen row update"
  on public.platform_admin_seen for update
  using (user_id = auth.uid() and public.is_platform_staff())
  with check (user_id = auth.uid() and public.is_platform_staff());

-- Returnér uread-tællere for den indloggede admin (0 hvis ikke platform_staff).
create or replace function public.platform_admin_unread_counts()
returns table (
  companies_count int,
  subscriptions_count int,
  support_count int
)
language sql
security definer
set search_path = public
as $$
  with seen as (
    select
      coalesce(s.companies_seen_at, now() - interval '30 days') as companies_seen_at,
      coalesce(s.subscriptions_seen_at, now() - interval '30 days') as subscriptions_seen_at,
      coalesce(s.support_seen_at, now() - interval '30 days') as support_seen_at
    from (select 1) x
    left join public.platform_admin_seen s on s.user_id = auth.uid()
  )
  select
    case when public.is_platform_staff() then
      (select count(*)::int from public.companies c, seen
        where c.created_at > seen.companies_seen_at)
    else 0 end as companies_count,
    case when public.is_platform_staff() then
      (select count(*)::int from public.subscriptions sub, seen
        where sub.status = 'active'
          and sub.updated_at > seen.subscriptions_seen_at)
    else 0 end as subscriptions_count,
    case when public.is_platform_staff() then
      (select count(*)::int from public.support_messages m, seen
        where m.is_staff = false
          and m.created_at > seen.support_seen_at)
    else 0 end as support_count;
$$;

grant execute on function public.platform_admin_unread_counts() to authenticated;

-- Recent events til dropdown'en (samlede 3 kategorier, max p_limit pr. kategori).
create or replace function public.platform_admin_recent_events(p_limit int default 8)
returns table (
  kind text,
  ref_id uuid,
  label text,
  sublabel text,
  occurred_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from (
    select
      'company'::text as kind,
      c.id as ref_id,
      coalesce(c.name, 'Ny virksomhed') as label,
      case when c.cvr is not null then 'CVR ' || c.cvr else 'Oprettet' end as sublabel,
      c.created_at as occurred_at
    from public.companies c
    where public.is_platform_staff()
    order by c.created_at desc
    limit p_limit
  ) x
  union all
  select * from (
    select
      'subscription'::text as kind,
      sub.id as ref_id,
      coalesce(co.name, 'Virksomhed') as label,
      'Aktivt abonnement' as sublabel,
      sub.updated_at as occurred_at
    from public.subscriptions sub
    join public.companies co on co.id = sub.company_id
    where public.is_platform_staff() and sub.status = 'active'
    order by sub.updated_at desc
    limit p_limit
  ) y
  union all
  select * from (
    select
      'support'::text as kind,
      m.ticket_id as ref_id,
      coalesce(co.name, 'Kunde') as label,
      left(coalesce(m.body, ''), 80) as sublabel,
      m.created_at as occurred_at
    from public.support_messages m
    join public.support_tickets t on t.id = m.ticket_id
    join public.companies co on co.id = t.company_id
    where public.is_platform_staff() and m.is_staff = false
    order by m.created_at desc
    limit p_limit
  ) z
  order by occurred_at desc;
$$;

grant execute on function public.platform_admin_recent_events(int) to authenticated;

-- Marker en eller alle kategorier som læst (sætter seen_at til now).
-- p_kind: 'companies' | 'subscriptions' | 'support' | 'all'
create or replace function public.platform_admin_mark_seen(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then return; end if;

  insert into public.platform_admin_seen (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  if p_kind = 'companies' or p_kind = 'all' then
    update public.platform_admin_seen
       set companies_seen_at = now(), updated_at = now()
     where user_id = auth.uid();
  end if;
  if p_kind = 'subscriptions' or p_kind = 'all' then
    update public.platform_admin_seen
       set subscriptions_seen_at = now(), updated_at = now()
     where user_id = auth.uid();
  end if;
  if p_kind = 'support' or p_kind = 'all' then
    update public.platform_admin_seen
       set support_seen_at = now(), updated_at = now()
     where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.platform_admin_mark_seen(text) to authenticated;

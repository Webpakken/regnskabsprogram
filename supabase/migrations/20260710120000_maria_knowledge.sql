-- Redigerbar "oplæring" af Maria (AI-support): svar-retningslinjer + videns-base.
-- Platform-staff vedligeholder indholdet på /platform/maria, og Marias hjerne
-- indlæser det ved hvert svar (oven på den indbyggede kerne-prompt). Sådan kan
-- teamet lære Maria nye funktioner og forbedre svar uden kodeændringer.

create table public.maria_settings (
  id int primary key default 1 check (id = 1),
  -- Global tænd/sluk for Maria (kill-switch). Slået fra → mennesker svarer.
  enabled boolean not null default true,
  -- Ekstra retningslinjer for HVORDAN Maria svarer (tone, regler, do/don't).
  response_guidelines text,
  updated_at timestamptz not null default now()
);

insert into public.maria_settings (id) values (1) on conflict (id) do nothing;

create table public.maria_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) > 0),
  check (length(trim(content)) > 0)
);

create index maria_knowledge_active_sort_idx on public.maria_knowledge (active, sort_order, created_at);

alter table public.maria_settings enable row level security;
alter table public.maria_knowledge enable row level security;

-- Kun platform-staff læser/redigerer. Marias hjerne læser via service role (omgår RLS).
create policy "Platform staff read maria settings" on public.maria_settings for select
  using (public.is_platform_staff());
create policy "Platform staff write maria settings" on public.maria_settings for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

create policy "Platform staff read maria knowledge" on public.maria_knowledge for select
  using (public.is_platform_staff());
create policy "Platform staff write maria knowledge" on public.maria_knowledge for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

grant select, insert, update, delete on public.maria_settings to authenticated;
grant select, insert, update, delete on public.maria_knowledge to authenticated;

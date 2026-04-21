alter table public.platform_public_settings
  add column if not exists landing_seo jsonb not null default '{}'::jsonb;

comment on column public.platform_public_settings.landing_seo is
  'SEO for marketing-forsiden (/): titel, meta, Open Graph, canonical, robots, valgfri JSON-LD.';

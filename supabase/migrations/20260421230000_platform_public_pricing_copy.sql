-- Redigerbar prissektion på forsiden (platform admin → Indstillinger → Pris)
alter table public.platform_public_settings
  add column if not exists pricing_title text,
  add column if not exists pricing_subtitle text,
  add column if not exists pricing_badge text,
  add column if not exists pricing_plan_name text,
  add column if not exists pricing_compare_cents int,
  add column if not exists pricing_amount_cents int,
  add column if not exists pricing_pitch text,
  add column if not exists pricing_features text,
  add column if not exists pricing_cta_label text;

comment on column public.platform_public_settings.pricing_title is 'Overskrift over priskort (fx Én plan. Alt inkluderet.)';
comment on column public.platform_public_settings.pricing_subtitle is 'Undertitel under overskrift';
comment on column public.platform_public_settings.pricing_badge is 'Badge over priskort (fx Introtilbud)';
comment on column public.platform_public_settings.pricing_plan_name is 'Produktnavn i kort (fx Bilago)';
comment on column public.platform_public_settings.pricing_compare_cents is 'Gennemstreget sammenligningspris i øre (fx 24900)';
comment on column public.platform_public_settings.pricing_amount_cents is 'Stor hovedpris i øre (fx 9900). Hvis null bruges monthly_price_cents.';
comment on column public.platform_public_settings.pricing_pitch is 'Tekst under pris; brug {beløb} som pladsholder for fx «99 kr./md»';
comment on column public.platform_public_settings.pricing_features is 'Punktliste, én linje pr. punkt';
comment on column public.platform_public_settings.pricing_cta_label is 'Knaptekst (fx Kom i gang)';

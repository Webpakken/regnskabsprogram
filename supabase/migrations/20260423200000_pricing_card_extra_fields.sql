-- Ekstra felter til priskortet på forsiden. "Spar X%" beregnes i koden ud fra
-- pricing_compare_cents og pricing_amount_cents og gemmes derfor ikke her.

alter table public.platform_public_settings
  add column if not exists pricing_unit_label text,
  add column if not exists pricing_lock_label text,
  add column if not exists pricing_footer_left text,
  add column if not exists pricing_footer_right text,
  add column if not exists pricing_feature_items jsonb;

comment on column public.platform_public_settings.pricing_unit_label is
  'Pris-enhed vist efter tallet, fx "kr./md.". Tom = fallback fra koden.';

comment on column public.platform_public_settings.pricing_lock_label is
  'Tekst i grønt hængelås-badge under prisen, fx "Fast pris så længe du er kunde".';

comment on column public.platform_public_settings.pricing_footer_left is
  'Tekst nederst-venstre i priskortet, fx "Sikkert. Trygt. Dansk.".';

comment on column public.platform_public_settings.pricing_footer_right is
  'Tekst nederst-højre i priskortet, fx "Ingen binding – opsig når som helst.".';

comment on column public.platform_public_settings.pricing_feature_items is
  'Array af {title, subtitle} til priskortets feature-liste. Tom = fallback fra koden.';

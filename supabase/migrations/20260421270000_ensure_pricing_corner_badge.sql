-- Idempotent: sikrer kolonne hvis en ældre deploy ikke kørte 20260421240000.
alter table public.platform_public_settings
  add column if not exists pricing_corner_badge text;

comment on column public.platform_public_settings.pricing_corner_badge is
  'Valgfri badge øverst til højre på priskort (tilbud/kampagne). Tom = beregn «Spar X%» fra sammenligningspris vs. kampagnepris, når begge er sat.';

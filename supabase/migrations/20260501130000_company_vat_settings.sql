-- Moms-indstillinger på virksomhedsniveau.
-- * vat_registered: Hvis false er virksomheden momsfritaget (fx ikke nået
--   omsætningsgrænsen på 50.000 kr eller har en momsfri ydelse). Skjuler moms-felter
--   i UI'et og udelader dem fra fakturaer/bilag.
-- * vat_period: Afregnings-interval — månedlig (>50 mio. omsætning),
--   kvartalsvis (5-50 mio.) eller halvårlig (<5 mio.).
-- * vat_period_started_at: Datoen hvor den nuværende interval-konfiguration trådte i
--   kraft. Bruges til moms-rapport-perioder; SKAT kræver kontinuitet.
alter table public.companies
  add column if not exists vat_registered boolean not null default true,
  add column if not exists vat_period text not null default 'quarterly'
    check (vat_period in ('monthly', 'quarterly', 'half_yearly')),
  add column if not exists vat_period_started_at date;

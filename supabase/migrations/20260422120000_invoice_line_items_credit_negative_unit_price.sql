-- Kreditnota-linjer: negativ enhedspris (positiv mængde) giver negativ netto/moms/brutto.
-- Den oprindelige check forhindrede gem — kredit bruger samme model som i appen (wizard).
alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_unit_price_cents_check;

comment on column public.invoice_line_items.unit_price_cents is
  'Enhedspris i øre; negativ tilladt for kreditnota-linjer (krediterer oprindelig faktura).';

-- Samlet refundering: når flere udlæg til samme person betales i én
-- bankoverførsel, gemmes den betalingstekst der blev sat i banken
-- (fx «Bilag 42,43,51») på hvert udlæg. Så kan en banktransaktion altid
-- kodes tilbage til de bilag den dækker.

alter table public.voucher_reimbursements
  add column if not exists refund_reference text,
  add column if not exists refunded_at timestamptz;

create index if not exists voucher_reimbursements_refund_reference_idx
  on public.voucher_reimbursements (company_id, refund_reference)
  where refund_reference is not null;

comment on column public.voucher_reimbursements.refund_reference is
  'Betalingstekst brugt i banken ved refundering, fx «Bilag 42,43,51». Deles af alle udlæg i samme overførsel.';
comment on column public.voucher_reimbursements.refunded_at is
  'Tidspunkt hvor udlægget blev markeret refunderet.';

notify pgrst, 'reload schema';

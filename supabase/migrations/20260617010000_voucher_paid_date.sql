-- Bilago: når et bilag markeres betalt, kan brugeren angive hvornår det blev
-- betalt. Null så længe bilaget er ikke-betalt.
alter table public.vouchers
  add column if not exists paid_date date;

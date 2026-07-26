-- Betalingsoplysninger udlæst fra fakturaer og indbetalingskort.
--
-- Formål: brugeren skal kunne kopiere FIK-linjen (+71<...+...<) eller
-- reg.nr./kontonr. direkte over i netbanken uden at taste manuelt.
-- Felterne udfyldes af `voucher-extract` ved scanning og kan rettes i hånden.

alter table public.vouchers
  -- Hvordan bilaget skal betales. null = ingen betalingsoplysninger fundet.
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('fik', 'bank_transfer', 'iban', 'mobilepay')),
  -- Hele FIK/GIK-linjen normaliseret, fx "+71<0000000000123456+12345678<"
  add column if not exists fik_line text,
  -- Kortart: 01, 04, 15, 71, 73 eller 75.
  add column if not exists fik_card_type text
    check (fik_card_type is null or fik_card_type ~ '^[0-9]{2}$'),
  -- Kreditornummer (8 cifre) — feltet efter '+' i FIK-linjen.
  add column if not exists fik_creditor_no text,
  -- Betalingsid (op til 16 cifre: 15 + kontrolciffer) — feltet mellem '<' og '+'.
  -- Tomt på kortart 01.
  add column if not exists fik_payment_id text,
  add column if not exists bank_reg_no text,
  add column if not exists bank_account_no text,
  add column if not exists iban text,
  -- Fri tekst til posteringstekst i netbanken (fakturanr., kundenr., ordrenr.).
  add column if not exists payment_reference text,
  -- Forfaldsdato. Adskilt fra expense_date, som er bilagsdatoen.
  add column if not exists due_date date;

-- Ubetalte regninger med forfaldsdato — driver "forfalder snart"-visninger.
create index if not exists vouchers_due_date_idx
  on public.vouchers (company_id, due_date)
  where due_date is not null and payment_status = 'unpaid';

comment on column public.vouchers.fik_line is
  'Normaliseret FIK/GIK-linje uden mellemrum, fx +71<0000000000123456+12345678<';

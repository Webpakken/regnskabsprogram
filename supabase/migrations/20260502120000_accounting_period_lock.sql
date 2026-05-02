-- Periodelås: revisor (eller ejer) kan låse alt på/før en bestemt dato.
-- Når låst kan ingen ændringer ske i den periode — hverken oprette, ændre eller slette.
-- Det giver revisor garanti for at det regnskab de har afsluttet ikke ændres bagefter.
-- For at lave ændringer i en låst periode skal man først låse op.
alter table public.companies
  add column if not exists accounting_locked_until date;

comment on column public.companies.accounting_locked_until is
  'Sidste dato der er regnskabslåst. Alle bilag/fakturaer/indtægter med dato <= denne dato er låst og kan ikke ændres.';

-- Hjælper til at tjekke om en given dato er låst for et firma. SECURITY DEFINER
-- så triggere kan kalde den uafhængigt af RLS.
create or replace function public.is_period_locked(p_company_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.accounting_locked_until is not null and p_date <= c.accounting_locked_until
      from public.companies c
      where c.id = p_company_id
    ),
    false
  );
$$;

grant execute on function public.is_period_locked(uuid, date) to authenticated;

-- ============================================================
-- TRIGGER: invoices
-- ============================================================
create or replace function public.invoices_block_locked_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until date;
begin
  if tg_op = 'INSERT' then
    if public.is_period_locked(new.company_id, new.issue_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Regnskabsperioden er låst til og med %. Lås op i indstillinger for at oprette fakturaer i denne periode.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Bloker hvis enten gammel eller ny dato falder i låst periode.
    if public.is_period_locked(old.company_id, old.issue_date)
       or public.is_period_locked(new.company_id, new.issue_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Fakturaen ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke ændres.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if public.is_period_locked(old.company_id, old.issue_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = old.company_id;
      raise exception 'Fakturaen ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke slettes.', v_locked_until
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists invoices_block_locked_period on public.invoices;
create trigger invoices_block_locked_period
  before insert or update or delete on public.invoices
  for each row execute function public.invoices_block_locked_period();

-- ============================================================
-- TRIGGER: vouchers
-- ============================================================
create or replace function public.vouchers_block_locked_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until date;
begin
  if tg_op = 'INSERT' then
    if public.is_period_locked(new.company_id, new.expense_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Regnskabsperioden er låst til og med %. Lås op i indstillinger for at uploade bilag i denne periode.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if public.is_period_locked(old.company_id, old.expense_date)
       or public.is_period_locked(new.company_id, new.expense_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Bilaget ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke ændres.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if public.is_period_locked(old.company_id, old.expense_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = old.company_id;
      raise exception 'Bilaget ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke slettes.', v_locked_until
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists vouchers_block_locked_period on public.vouchers;
create trigger vouchers_block_locked_period
  before insert or update or delete on public.vouchers
  for each row execute function public.vouchers_block_locked_period();

-- ============================================================
-- TRIGGER: income_entries (foreninger)
-- ============================================================
create or replace function public.income_entries_block_locked_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until date;
begin
  if tg_op = 'INSERT' then
    if public.is_period_locked(new.company_id, new.entry_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Regnskabsperioden er låst til og med %. Lås op i indstillinger for at registrere indtægter i denne periode.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if public.is_period_locked(old.company_id, old.entry_date)
       or public.is_period_locked(new.company_id, new.entry_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = new.company_id;
      raise exception 'Indtægten ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke ændres.', v_locked_until
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if public.is_period_locked(old.company_id, old.entry_date) then
      select accounting_locked_until into v_locked_until from public.companies where id = old.company_id;
      raise exception 'Indtægten ligger i en låst regnskabsperiode (% eller tidligere) og kan ikke slettes.', v_locked_until
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists income_entries_block_locked_period on public.income_entries;
create trigger income_entries_block_locked_period
  before insert or update or delete on public.income_entries
  for each row execute function public.income_entries_block_locked_period();

-- ============================================================
-- TRIGGER: invoice_line_items (afhænger af parent invoices.issue_date)
-- ============================================================
create or replace function public.invoice_line_items_block_locked_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_issue_date date;
  v_locked_until date;
begin
  -- For INSERT/UPDATE: brug new; for DELETE: brug old.
  if tg_op = 'DELETE' then
    select i.company_id, i.issue_date into v_company_id, v_issue_date
    from public.invoices i where i.id = old.invoice_id;
  else
    select i.company_id, i.issue_date into v_company_id, v_issue_date
    from public.invoices i where i.id = new.invoice_id;
  end if;

  if v_company_id is null then
    -- Parent-faktura findes ikke (cascade-delete fra invoice). Lad operationen passere.
    return coalesce(new, old);
  end if;

  if public.is_period_locked(v_company_id, v_issue_date) then
    select accounting_locked_until into v_locked_until from public.companies where id = v_company_id;
    raise exception 'Faktura-linjen tilhører en faktura i låst regnskabsperiode (% eller tidligere) og kan ikke ændres.', v_locked_until
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_line_items_block_locked_period on public.invoice_line_items;
create trigger invoice_line_items_block_locked_period
  before insert or update or delete on public.invoice_line_items
  for each row execute function public.invoice_line_items_block_locked_period();

-- ============================================================
-- TRIGGER: voucher_reimbursements (afhænger af parent vouchers.expense_date)
-- ============================================================
create or replace function public.voucher_reimbursements_block_locked_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_expense_date date;
  v_locked_until date;
begin
  if tg_op = 'DELETE' then
    select v.company_id, v.expense_date into v_company_id, v_expense_date
    from public.vouchers v where v.id = old.voucher_id;
  else
    select v.company_id, v.expense_date into v_company_id, v_expense_date
    from public.vouchers v where v.id = new.voucher_id;
  end if;

  if v_company_id is null then
    return coalesce(new, old);
  end if;

  if public.is_period_locked(v_company_id, v_expense_date) then
    select accounting_locked_until into v_locked_until from public.companies where id = v_company_id;
    raise exception 'Udlægget tilhører et bilag i låst regnskabsperiode (% eller tidligere) og kan ikke ændres.', v_locked_until
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists voucher_reimbursements_block_locked_period on public.voucher_reimbursements;
create trigger voucher_reimbursements_block_locked_period
  before insert or update or delete on public.voucher_reimbursements
  for each row execute function public.voucher_reimbursements_block_locked_period();

-- ============================================================
-- Forhindr at man fjerner en låsning når der er et nyere låsningsdato
-- (defensiv: lås kan kun rykkes FREMAD eller fjernes helt af owner/manager).
-- Selve auth-checken sker i UI'et via roller, men den tabel-policy sikrer at
-- det ikke kan rulles tilbage ved en fejl.
-- ============================================================
-- (Vi lader pt. policy-laget på companies styre hvem der må opdatere
--  accounting_locked_until — der er allerede en write-policy på companies
--  der begrænser til owner/manager.)

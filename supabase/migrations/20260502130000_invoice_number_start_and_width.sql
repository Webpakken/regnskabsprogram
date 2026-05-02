-- Første fakturanummer (fx 0001) og minimum antal cifre i nummerserien.
alter table public.companies
  add column if not exists invoice_starting_number int not null default 1
    check (invoice_starting_number >= 1),
  add column if not exists invoice_number_digit_width int not null default 4
    check (invoice_number_digit_width >= 2 and invoice_number_digit_width <= 12);

comment on column public.companies.invoice_starting_number is
  'Første nummer i serien når invoice_number_seq oprettes (fx 1 → 0001).';
comment on column public.companies.invoice_number_digit_width is
  'Minimum antal cifre i fakturanummer (fx 4 → 0001); udvides automatisk ved store tal.';

create or replace function public.next_invoice_number(p_company_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_next int;
  v_width int;
  v_start int;
begin
  if not exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  select
    greatest(2, least(12, coalesce(c.invoice_number_digit_width, 4))),
    greatest(1, coalesce(c.invoice_starting_number, 1))
  into v_width, v_start
  from public.companies c
  where c.id = p_company_id;

  if not found then
    raise exception 'company not found';
  end if;

  -- Brug greatest() så et højere invoice_starting_number altid honoreres
  -- (selv hvis seq-row allerede findes med en lavere værdi). Forhindrer også
  -- baglæns-spring hvis user sætter start lavere end nuværende seq.
  insert into public.invoice_number_seq (company_id, last_value)
  values (p_company_id, v_start)
  on conflict (company_id) do update
    set last_value = greatest(public.invoice_number_seq.last_value + 1, v_start)
  returning last_value into v_next;

  return lpad(v_next::text, greatest(v_width, length(v_next::text)), '0');
end;
$$;

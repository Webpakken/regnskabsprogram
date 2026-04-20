-- Aggregated "product" templates from invoice lines (description + price + VAT)

create or replace function public.get_popular_invoice_products_globally(p_limit int default 8)
returns table (
  description text,
  unit_price_cents bigint,
  vat_rate numeric,
  usage_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    li.description,
    li.unit_price_cents,
    li.vat_rate,
    count(*)::bigint as usage_count
  from public.invoice_line_items li
  inner join public.invoices inv on inv.id = li.invoice_id
  where length(trim(li.description)) > 0
  group by li.description, li.unit_price_cents, li.vat_rate
  order by usage_count desc, li.description asc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
$$;

create or replace function public.get_popular_invoice_products_for_company(
  p_company_id uuid,
  p_limit int default 8
)
returns table (
  description text,
  unit_price_cents bigint,
  vat_rate numeric,
  usage_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    li.description,
    li.unit_price_cents,
    li.vat_rate,
    count(*)::bigint as usage_count
  from public.invoice_line_items li
  inner join public.invoices inv on inv.id = li.invoice_id
  where inv.company_id = p_company_id
    and p_company_id in (select public.user_company_ids())
    and length(trim(li.description)) > 0
  group by li.description, li.unit_price_cents, li.vat_rate
  order by usage_count desc, li.description asc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
$$;

grant execute on function public.get_popular_invoice_products_globally(int) to authenticated;
grant execute on function public.get_popular_invoice_products_for_company(uuid, int) to authenticated;

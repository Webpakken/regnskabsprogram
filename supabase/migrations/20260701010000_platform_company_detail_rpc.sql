-- Bilago: platform-staff virksomheds-detaljer. Én SECURITY DEFINER-RPC samler
-- virksomhedens oplysninger, opretter (ejer), abonnement og betalingshistorik,
-- så staff kan se det uden at der åbnes bred RLS-adgang til members/profiles/auth.
-- Adgang gated på is_platform_staff().

create or replace function public.get_platform_company_detail(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_staff() then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'company', to_jsonb(c),
    'subscription', (
      select jsonb_build_object(
        'status', s.status,
        'current_period_end', s.current_period_end,
        'stripe_customer_id', s.stripe_customer_id,
        'stripe_subscription_id', s.stripe_subscription_id,
        'plan_name', bp.name,
        'monthly_price_cents', bp.monthly_price_cents,
        'updated_at', s.updated_at
      )
      from public.subscriptions s
      left join public.billing_plans bp on bp.id = s.billing_plan_id
      where s.company_id = c.id
    ),
    'owner', (
      select jsonb_build_object(
        'user_id', m.user_id,
        'full_name', p.full_name,
        'email', u.email,
        'member_since', m.created_at
      )
      from public.company_members m
      left join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
      where m.company_id = c.id and m.role = 'owner'
      order by m.created_at asc
      limit 1
    ),
    'members', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'user_id', m.user_id,
            'full_name', p.full_name,
            'email', u.email,
            'role', m.role,
            'created_at', m.created_at
          )
          order by m.created_at asc
        ),
        '[]'::jsonb
      )
      from public.company_members m
      left join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
      where m.company_id = c.id
    ),
    'payments', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'gross_cents', i.gross_cents,
            'net_cents', i.net_cents,
            'vat_cents', i.vat_cents,
            'currency', i.currency,
            'plan_name', i.plan_name,
            'period_start', i.period_start,
            'period_end', i.period_end,
            'voucher_id', i.voucher_id,
            'issued_at', i.issued_at
          )
          order by i.issued_at desc
        ),
        '[]'::jsonb
      )
      from public.platform_subscription_invoices i
      where i.company_id = c.id
    )
  )
  into result
  from public.companies c
  where c.id = p_company_id;

  if result is null then
    raise exception 'company not found';
  end if;

  return result;
end;
$$;

grant execute on function public.get_platform_company_detail(uuid) to authenticated;

-- Gør Udlægslink synlig i feature-biblioteket, så den kan kobles på planer.

insert into public.billing_features (key, name, description, sort_order)
values (
  'expense_links',
  'Udlægslink',
  'Send et sikkert link, hvor medarbejdere og hjælpere kan uploade udlæg uden login.',
  35
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Pro får funktionen aktiv som standard. Andre planer kan til-/fravælges i platform-admin.
insert into public.billing_plan_features (plan_id, feature_id, enabled, limit_value)
select p.id, f.id, true, null
from public.billing_plans p
join public.billing_features f on f.key = 'expense_links'
where p.slug = 'pro'
on conflict (plan_id, feature_id) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

notify pgrst, 'reload schema';

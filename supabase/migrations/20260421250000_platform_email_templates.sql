alter table public.platform_public_settings
  add column if not exists email_templates jsonb;

comment on column public.platform_public_settings.email_templates is
  'JSON: welcome_new_user, password_reset, company_member_invite, invoice_sent — hver med enabled, subject, html (pladsholdere {{...}}).';

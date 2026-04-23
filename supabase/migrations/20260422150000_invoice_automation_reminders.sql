-- Automatiske betalingspåmindelser (cron → Edge Function `invoice-automation-reminders`).
alter table public.companies
  add column if not exists automation_reminders_enabled boolean not null default false,
  add column if not exists automation_reminder_first_days_after_due integer not null default 1
    check (automation_reminder_first_days_after_due >= 0 and automation_reminder_first_days_after_due <= 365),
  add column if not exists automation_reminder_interval_days integer not null default 7
    check (automation_reminder_interval_days >= 1 and automation_reminder_interval_days <= 365);

comment on column public.companies.automation_reminders_enabled is
  'Når true: planlagt job sender automatisk e-mail (skabelon «invoice_reminder») for sendte fakturaer efter reglerne.';
comment on column public.companies.automation_reminder_first_days_after_due is
  'Antal kalenderdage efter forfaldsdato før første automatiske påmindelse (0 = samme dag som forfald).';
comment on column public.companies.automation_reminder_interval_days is
  'Minimum antal kalenderdage mellem efterfølgende automatiske påmindelser for samme faktura.';

alter table public.invoices
  add column if not exists last_automation_reminder_at timestamptz,
  add column if not exists automation_reminder_send_count integer not null default 0
    check (automation_reminder_send_count >= 0 and automation_reminder_send_count <= 100);

comment on column public.invoices.last_automation_reminder_at is
  'Tidspunkt for seneste automatiske påmindelse (manuel «Send påmindelse» sætter ikke dette felt).';
comment on column public.invoices.automation_reminder_send_count is
  'Antal automatiske påmindelser sendt for denne faktura (maks. håndhæves i Edge Function).';

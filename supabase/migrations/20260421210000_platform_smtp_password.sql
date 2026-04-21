-- SMTP-adgangskode (klartekst i DB — kun platform-staff via RLS; rotation anbefales ved læk).
alter table public.platform_smtp_profiles
  add column if not exists smtp_password text;

comment on column public.platform_smtp_profiles.smtp_password is
  'SMTP password for sending; readable only by platform staff RLS — prefer env secrets for highly sensitive deployments.';

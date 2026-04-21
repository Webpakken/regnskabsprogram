-- Hvis du får: "Could not find the 'smtp_password' column ... in the schema cache"
-- er denne migration ikke kørt mod dit Supabase-projekt endnu.
--
-- Kør i Supabase Dashboard → SQL Editor (postgres), eller: supabase db push (linket projekt).

alter table public.platform_smtp_profiles
  add column if not exists smtp_password text;

comment on column public.platform_smtp_profiles.smtp_password is
  'SMTP password for sending; readable only by platform staff RLS — prefer env secrets for highly sensitive deployments.';

-- PostgREST opdaterer schema cache kort efter; genindlæs evt. appen.

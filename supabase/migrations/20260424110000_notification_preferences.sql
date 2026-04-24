-- Enkle notifikationspræferencer pr. bruger.
-- Første version er global pr. bruger (ikke pr. virksomhed / kanal),
-- så vi kan starte med få toggles og udvide senere.

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  support_replies boolean not null default true,
  member_invites boolean not null default true,
  invoice_sent boolean not null default true,
  invoice_reminders boolean not null default true,
  subscription_updates boolean not null default true,
  platform_new_companies boolean not null default true,
  platform_new_support boolean not null default true,
  platform_new_subscriptions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Notifikationspræferencer for den enkelte bruger. Første version: simple boolean-toggles.';

comment on column public.notification_preferences.support_replies is
  'Få besked når Bilago svarer på en supporttråd.';
comment on column public.notification_preferences.member_invites is
  'Få besked når brugeren inviteres til en virksomhed eller et samarbejde.';
comment on column public.notification_preferences.invoice_sent is
  'Få besked når faktura sendes til kunde.';
comment on column public.notification_preferences.invoice_reminders is
  'Få besked når betalingspåmindelse eller rykker sendes.';
comment on column public.notification_preferences.subscription_updates is
  'Få besked om abonnement, betaling og prøveperiode.';
comment on column public.notification_preferences.platform_new_companies is
  'Platform admin: få besked om nye virksomheder.';
comment on column public.notification_preferences.platform_new_support is
  'Platform admin: få besked om nye supporthenvendelser.';
comment on column public.notification_preferences.platform_new_subscriptions is
  'Platform admin: få besked om nye eller ændrede abonnementer.';

alter table public.notification_preferences enable row level security;

create policy "Own notification preferences read"
  on public.notification_preferences for select
  using (user_id = auth.uid());

create policy "Own notification preferences insert"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

create policy "Own notification preferences update"
  on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

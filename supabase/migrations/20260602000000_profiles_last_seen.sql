-- Tidsstempel for sidste gang brugeren åbnede/brugte platformen (heartbeat ved app-load).
-- Bruges på Medlemmer-siden til "Sidste aktivitet", så login/almindelig brug også tæller
-- som aktivitet — ikke kun faktura/bilag-hændelser i activity_events.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Sidste gang brugeren åbnede platformen (opdateres throttled fra klienten).';

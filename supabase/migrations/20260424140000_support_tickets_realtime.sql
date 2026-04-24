-- Realtime for support-ticketlisten, så både kunde- og platform-visninger kan opdatere live.

do $$
begin
  begin
    alter publication supabase_realtime add table public.support_tickets;
  exception
    when duplicate_object then null;
  end;
end $$;

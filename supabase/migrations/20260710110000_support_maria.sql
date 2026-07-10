-- Maria i det eksisterende support-ticket-system.
-- Maria svarer som en staff-besked (is_staff=true) markeret is_ai=true, så den
-- vises som "Maria" og ikke som et menneske. Eskalering til et menneske styres
-- pr. ticket med wants_human; ai_enabled slås fra når et menneske overtager.

alter table public.support_tickets
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists wants_human boolean not null default false;

alter table public.support_messages
  add column if not exists is_ai boolean not null default false;

-- Push-triggeren pusher kunden når is_staff=true. Marias svar kommer synkront
-- mens kunden ser skærmen, så vi springer AI-beskeder over — kun rigtige
-- medarbejder-svar udløser push (uændret adfærd).
create or replace function public.notify_support_staff_reply_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_secret text;
  v_url text;
begin
  if new.is_staff is distinct from true then
    return new;
  end if;

  -- Marias AI-svar skal ikke pushe kunden (de chatter aktivt lige nu).
  if new.is_ai is true then
    return new;
  end if;

  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets
     where name = 'platform_event_secret'
     limit 1;
  exception when others then
    v_secret := null;
  end;

  if v_secret is null or v_secret = '' then
    return new;
  end if;

  v_url := coalesce(
    current_setting('app.supabase_functions_url', true),
    'https://vfswagwhjshjnmppptif.supabase.co/functions/v1'
  );

  perform net.http_post(
    url := v_url || '/support-push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bilago-platform-event', v_secret
    ),
    body := jsonb_build_object(
      'ticket_id', new.ticket_id::text
    )
  );

  return new;
exception when others then
  -- Push må aldrig blokere beskeden.
  return new;
end;
$$;

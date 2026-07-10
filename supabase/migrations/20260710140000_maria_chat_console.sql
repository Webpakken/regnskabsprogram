-- Support-konsol-paritet med bestyrelse.nu: ulæst-badge, læst-kvittering og hurtige svar.
--   1) visitor_read_at: sættes fra widgeten (via chat-history) når kunden ser beskeden.
--   2) support_conversations(): samtaler + antal ulæste besøgende-beskeder til badge.
--   3) chat_canned_responses: hurtige svar staff kan indsætte.

alter table public.chat_conversations
  add column if not exists visitor_read_at timestamptz;

-- Samtaler med antal ulæste (besøgende-)beskeder for platform-staff.
create or replace function public.support_conversations()
returns table (
  id              uuid,
  visitor_name    text,
  visitor_email   text,
  status          text,
  ai_enabled      boolean,
  wants_human     boolean,
  last_message_at timestamptz,
  unread          int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Ingen adgang til support';
  end if;

  return query
  select
    c.id,
    c.visitor_name,
    c.visitor_email,
    c.status,
    c.ai_enabled,
    c.wants_human,
    c.last_message_at,
    (
      select count(*)::int
      from public.chat_messages m
      where m.conversation_id = c.id
        and m.sender = 'visitor'
        and m.created_at > coalesce(c.agent_read_at, '-infinity'::timestamptz)
    ) as unread
  from public.chat_conversations c
  order by c.last_message_at desc;
end;
$$;

grant execute on function public.support_conversations() to authenticated;

-- Hurtige svar til live chat.
create table if not exists public.chat_canned_responses (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (length(trim(title)) > 0),
  check (length(trim(body)) > 0)
);

alter table public.chat_canned_responses enable row level security;

create policy "Platform staff all canned responses" on public.chat_canned_responses for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

grant select, insert, update, delete on public.chat_canned_responses to authenticated;

notify pgrst, 'reload schema';

-- Maria live chat: flydende widget-samtaler (anonyme ELLER indloggede besøgende).
-- Adskilt fra support_tickets (som kræver login + virksomhed). Besøgende tilgår
-- kun via edge functions (service role); platform_staff besvarer i konsollen.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Hemmeligt handle som widgeten gemmer i localStorage og sender med hver besked.
  token uuid not null default gen_random_uuid(),
  visitor_name text,
  visitor_email text,
  visitor_ip text,
  -- Sat hvis den besøgende var logget ind (verificeret i edge function).
  user_id uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  -- Håndterer Maria (AI) samtalen? Sættes false når et menneske overtager.
  ai_enabled boolean not null default true,
  -- Har kunden bedt om et menneske? (Maria svarer stadig imens.)
  wants_human boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed')),
  -- Hvornår en medarbejder sidst så samtalen (til ulæst-markering i konsollen).
  agent_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index chat_conversations_status_idx on public.chat_conversations (status, last_message_at desc);
create index chat_conversations_ip_idx on public.chat_conversations (visitor_ip, created_at);
create index chat_conversations_user_idx on public.chat_conversations (user_id);
create index chat_conversations_waiting_idx
  on public.chat_conversations (wants_human, last_message_at desc)
  where wants_human;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender text not null check (sender in ('visitor', 'agent')),
  -- 'Maria' for AI-svar, ellers medarbejderens navn.
  agent_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

-- Kun platform_staff tilgår tabellerne direkte (konsollen). Besøgende går via
-- edge functions med service role, der omgår RLS.
create policy "Platform staff all chat conversations" on public.chat_conversations for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

create policy "Platform staff all chat messages" on public.chat_messages for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- Realtime for staff-konsollen (postgres_changes).
alter publication supabase_realtime add table public.chat_conversations;
alter publication supabase_realtime add table public.chat_messages;

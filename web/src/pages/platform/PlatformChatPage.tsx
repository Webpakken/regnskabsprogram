import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { mdToHtml } from '@/lib/markdown'
import type { Database } from '@/types/database'
import { PlatformMariaPage } from './PlatformMariaPage'

type Conv = {
  id: string
  visitor_name: string | null
  visitor_email: string | null
  status: string
  ai_enabled: boolean
  wants_human: boolean
  last_message_at: string
  unread: number
}
type Msg = Database['public']['Tables']['chat_messages']['Row']
type Canned = Database['public']['Tables']['chat_canned_responses']['Row']

// Fast, offentligt agent-navn (aldrig medarbejderens personlige navn/e-mail).
const AGENT_NAME = 'Support'

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('da-DK', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

/** Live-chat support-konsollen — port af bestyrelse.nu's SupportConsole. */
function SupportConversations() {
  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [visitorReadAt, setVisitorReadAt] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [canned, setCanned] = useState<Canned[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const loadConvs = useCallback(async () => {
    const rpc = await supabase.rpc('support_conversations')
    if (!rpc.error && rpc.data) {
      setConvs(rpc.data as Conv[])
      return
    }
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, visitor_name, visitor_email, status, ai_enabled, wants_human, last_message_at')
      .order('last_message_at', { ascending: false })
    setConvs(((data as Omit<Conv, 'unread'>[]) ?? []).map((c) => ({ ...c, unread: 0 })))
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    const [{ data: msgs }, { data: conv }] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('chat_conversations')
        .select('visitor_read_at, ai_enabled')
        .eq('id', id)
        .maybeSingle(),
    ])
    setMessages((msgs as Msg[]) ?? [])
    setVisitorReadAt((conv as { visitor_read_at: string | null } | null)?.visitor_read_at ?? null)
    setAiEnabled((conv as { ai_enabled: boolean } | null)?.ai_enabled ?? true)
  }, [])

  useEffect(() => {
    void supabase
      .from('chat_canned_responses')
      .select('*')
      .order('sort_order')
      .order('created_at', { ascending: false })
      .then(({ data }) => setCanned((data as Canned[]) ?? []))
  }, [])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Liste + realtid (nye samtaler/beskeder + kundens læst-kvittering)
  useEffect(() => {
    void loadConvs()
    const ch = supabase
      .channel('support-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, (payload) => {
        void loadConvs()
        const cid = (payload.new as { id?: string })?.id
        if (cid && cid === activeIdRef.current) void loadMessages(cid)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        void loadConvs()
        const cid = (payload.new as Msg)?.conversation_id
        if (cid && cid === activeIdRef.current) void loadMessages(cid)
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [loadConvs, loadMessages])

  const openConv = useCallback(
    (id: string) => {
      setActiveId(id)
      void loadMessages(id)
      setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)))
      void supabase
        .from('chat_conversations')
        .update({ agent_read_at: new Date().toISOString() })
        .eq('id', id)
      if (channelRef.current) void supabase.removeChannel(channelRef.current)
      const ch = supabase.channel(`chat-${id}`, { config: { broadcast: { self: false } } })
      ch.on('broadcast', { event: 'ping' }, () => void loadMessages(id))
      ch.subscribe()
      channelRef.current = ch
    },
    [loadMessages],
  )

  // Åbn samtale fra push-link (?c=<id>), én gang.
  const openedFromParam = useRef(false)
  useEffect(() => {
    if (openedFromParam.current || convs.length === 0) return
    const cid = new URLSearchParams(window.location.search).get('c')
    if (cid && convs.some((c) => c.id === cid)) {
      openedFromParam.current = true
      openConv(cid)
    }
  }, [convs, openConv])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    const body = text.trim()
    if (!body || !activeId || sending) return
    setSending(true)
    try {
      setText('')
      await supabase.from('chat_messages').insert({
        conversation_id: activeId,
        sender: 'agent',
        agent_name: AGENT_NAME,
        body,
      })
      // Et menneske har svaret → Maria træder tilbage, kunden er ikke i kø.
      await supabase
        .from('chat_conversations')
        .update({
          ai_enabled: false,
          wants_human: false,
          last_message_at: new Date().toISOString(),
          agent_read_at: new Date().toISOString(),
        })
        .eq('id', activeId)
      channelRef.current?.send({ type: 'broadcast', event: 'ping', payload: {} })
      void loadMessages(activeId)
      void supabase.functions.invoke('chat-agent-notify', {
        body: { conversation_id: activeId, body },
      })
    } finally {
      setSending(false)
    }
  }

  async function giveBackToMaria() {
    if (!activeId) return
    await supabase
      .from('chat_conversations')
      .update({ ai_enabled: true, wants_human: false })
      .eq('id', activeId)
    void loadMessages(activeId)
    void loadConvs()
  }

  const active = convs.find((c) => c.id === activeId)

  return (
    <div className="grid h-[70vh] gap-4 md:grid-cols-[280px_1fr]">
      {/* Liste */}
      <div
        className={`overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${
          activeId ? 'hidden md:block' : ''
        }`}
      >
        {convs.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Ingen samtaler endnu.</p>
        ) : (
          convs.map((c) => (
            <button
              key={c.id}
              onClick={() => openConv(c.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                c.id === activeId ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`truncate text-sm ${c.unread > 0 ? 'font-bold' : 'font-semibold'}`}>
                  {c.visitor_name || 'Besøgende'}
                </div>
                {c.wants_human ? (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">
                    menneske
                  </span>
                ) : null}
                {c.unread > 0 ? (
                  <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">
                    {c.unread > 99 ? '99+' : c.unread}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-slate-500">{c.visitor_email || 'ingen e-mail'}</div>
            </button>
          ))
        )}
      </div>

      {/* Samtale */}
      <div
        className={`flex flex-col overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-sm ${
          activeId ? 'max-md:fixed max-md:inset-0 max-md:z-[70]' : 'hidden md:flex'
        }`}
      >
        {!active ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-500">Vælg en samtale</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <button onClick={() => setActiveId(null)} className="px-1 text-xl leading-none text-slate-500 md:hidden">
                ←
              </button>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{active.visitor_name || 'Besøgende'}</div>
                <div className="truncate text-xs text-slate-500">{active.visitor_email || 'ingen e-mail'}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!aiEnabled ? (
                  <button
                    type="button"
                    onClick={() => void giveBackToMaria()}
                    className="rounded-lg border border-violet-200 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                  >
                    Giv tilbage til Maria
                  </button>
                ) : (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    Maria svarer
                  </span>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m, i) => {
                const isAgent = m.sender === 'agent'
                const isMaria = isAgent && m.agent_name === 'Maria'
                const isLastAgent = isAgent && !messages.slice(i + 1).some((x) => x.sender === 'agent')
                const seen =
                  isLastAgent &&
                  !!visitorReadAt &&
                  new Date(visitorReadAt).getTime() >= new Date(m.created_at).getTime()
                return (
                  <div key={m.id} className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        isMaria ? 'bg-violet-100 text-slate-800' : isAgent ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {isAgent ? (
                        <div
                          className="space-y-1.5 [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: mdToHtml(m.body) }}
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.body}</span>
                      )}
                    </div>
                    <div className="mt-0.5 px-1 text-[11px] text-slate-400">
                      {isMaria ? 'Maria · ' : ''}
                      {fmtTime(m.created_at)}
                      {isLastAgent && !isMaria ? <span className="ml-1">· {seen ? 'Læst' : 'Sendt'}</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-2 border-t border-slate-200 p-3">
              {canned.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {canned.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.body}
                      onClick={() => setText(c.body)}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-indigo-300 hover:text-slate-800"
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Skriv et svar…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                <button
                  onClick={() => void send()}
                  disabled={sending}
                  className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Hurtige svar — CRUD (port af bestyrelse.nu's /support/svar). */
function CannedResponses() {
  const [items, setItems] = useState<Canned[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('chat_canned_responses')
      .select('*')
      .order('sort_order')
      .order('created_at', { ascending: false })
    setItems((data as Canned[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!title.trim() || !body.trim()) return
    setBusy(true)
    await supabase.from('chat_canned_responses').insert({ title: title.trim(), body: body.trim() })
    setTitle('')
    setBody('')
    setBusy(false)
    await load()
  }

  async function remove(id: string) {
    await supabase.from('chat_canned_responses').delete().eq('id', id)
    await load()
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-600">
        Hurtige svar vises som knapper i samtalen, så du kan indsætte et standardsvar med ét klik.
      </p>
      {items.map((c) => (
        <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{c.title}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{c.body}</p>
          </div>
          <button
            type="button"
            onClick={() => void remove(c.id)}
            className="shrink-0 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            Slet
          </button>
        </div>
      ))}
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Nyt hurtigt svar</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (fx 'Åbningstider')"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Svartekst"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void add()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Tilføjer…' : 'Tilføj'}
        </button>
      </div>
    </div>
  )
}

type Tab = 'samtaler' | 'svar' | 'maria'

export function PlatformChatPage() {
  const { profile } = useApp()
  const [tab, setTab] = useState<Tab>('samtaler')
  void profile

  const tabs: { id: Tab; label: string }[] = [
    { id: 'samtaler', label: 'Samtaler' },
    { id: 'svar', label: 'Hurtige svar' },
    { id: 'maria', label: 'Oplær Maria' },
  ]

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">Live chat med Maria — og dig, når kunden har brug for et menneske.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'samtaler' ? <SupportConversations /> : null}
      {tab === 'svar' ? <CannedResponses /> : null}
      {tab === 'maria' ? <PlatformMariaPage /> : null}
    </div>
  )
}

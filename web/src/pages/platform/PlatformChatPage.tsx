import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { formatDateTime } from '@/lib/format'
import { mdToHtml } from '@/lib/markdown'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Conversation = Database['public']['Tables']['chat_conversations']['Row']
type Message = Database['public']['Tables']['chat_messages']['Row']

export function PlatformChatPage() {
  const { user, profile } = useApp()
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const staffName = profile?.full_name?.trim() || 'Support'

  const loadConversations = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('chat_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setConversations(data ?? [])
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    const { data, error: qErr } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    if (qErr) {
      setError(qErr.message)
      return
    }
    setMessages(data ?? [])
    // Marker som læst.
    await supabase
      .from('chat_conversations')
      .update({ agent_read_at: new Date().toISOString() })
      .eq('id', id)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const c = searchParams.get('c')
    if (!c) return
    if (!conversations.some((x) => x.id === c)) return
    setSelectedId((cur) => cur ?? c)
  }, [conversations, searchParams])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    void loadMessages(selectedId)
  }, [selectedId, loadMessages])

  // Realtime for konsollen.
  useEffect(() => {
    const ch = supabase.channel('platform-chat-live')
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
      void loadConversations()
    })
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
      if (selectedId) void loadMessages(selectedId)
      void loadConversations()
    })
    void ch.subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [loadConversations, loadMessages, selectedId])

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  async function sendReply() {
    if (!selectedId || !user || !reply.trim()) return
    setSending(true)
    setError(null)
    const { error: insErr } = await supabase.from('chat_messages').insert({
      conversation_id: selectedId,
      sender: 'agent',
      agent_name: staffName,
      body: reply.trim(),
    })
    if (insErr) {
      setError(insErr.message)
      setSending(false)
      return
    }
    // Et menneske har overtaget → Maria svarer ikke mere, kunden er ikke i kø.
    await supabase
      .from('chat_conversations')
      .update({
        ai_enabled: false,
        wants_human: false,
        last_message_at: new Date().toISOString(),
        agent_read_at: new Date().toISOString(),
      })
      .eq('id', selectedId)
    setReply('')
    await loadMessages(selectedId)
    await loadConversations()
    setSending(false)
  }

  async function setStatus(status: 'open' | 'closed') {
    if (!selectedId) return
    await supabase.from('chat_conversations').update({ status }).eq('id', selectedId)
    await loadConversations()
  }

  async function giveBackToMaria() {
    if (!selectedId) return
    await supabase
      .from('chat_conversations')
      .update({ ai_enabled: true, wants_human: false })
      .eq('id', selectedId)
    await loadConversations()
  }

  function unread(c: Conversation): boolean {
    if (!c.agent_read_at) return true
    return new Date(c.last_message_at).getTime() > new Date(c.agent_read_at).getTime()
  }

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row">
      <div className="lg:w-80 lg:shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Live chat</h1>
        <p className="mt-1 text-sm text-slate-600">Maria-samtaler fra websitet og appen.</p>
        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Indlæser…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Ingen samtaler endnu.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                      selectedId === c.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium text-slate-900">
                        {unread(c) ? <span className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
                        {c.visitor_name || c.visitor_email || 'Besøgende'}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(c.last_message_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {c.status === 'closed' ? (
                        <span className="text-slate-400">Lukket</span>
                      ) : c.wants_human ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                          Venter på menneske
                        </span>
                      ) : c.ai_enabled ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">
                          Maria svarer
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                          Menneske
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {!selected ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Vælg en samtale til venstre.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {selected.visitor_name || 'Besøgende'}
                </h2>
                {selected.visitor_email ? (
                  <p className="text-sm text-slate-600">{selected.visitor_email}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!selected.ai_enabled ? (
                  <button
                    type="button"
                    onClick={() => void giveBackToMaria()}
                    className="rounded-lg border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
                  >
                    Giv tilbage til Maria
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void setStatus(selected.status === 'closed' ? 'open' : 'closed')}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {selected.status === 'closed' ? 'Genåbn' : 'Luk samtale'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <ul className="space-y-3">
                {messages.map((m) => {
                  const isVisitor = m.sender === 'visitor'
                  const isMaria = m.sender === 'agent' && m.agent_name === 'Maria'
                  return (
                    <li key={m.id} className={`flex ${isVisitor ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          isVisitor
                            ? 'bg-slate-100 text-slate-800'
                            : isMaria
                              ? 'bg-violet-50 text-slate-800'
                              : 'bg-indigo-600 text-white'
                        }`}
                      >
                        <div
                          className={`mb-0.5 text-[11px] font-semibold ${
                            isVisitor ? 'text-slate-500' : isMaria ? 'text-violet-600' : 'text-white/80'
                          }`}
                        >
                          {isVisitor ? selected.visitor_name || 'Besøgende' : m.agent_name || 'Support'}
                          <span className="ml-2 font-normal">{formatDateTime(m.created_at)}</span>
                        </div>
                        {isVisitor ? (
                          <span className="whitespace-pre-wrap">{m.body}</span>
                        ) : (
                          <div
                            className="space-y-1.5 [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: mdToHtml(m.body) }}
                          />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-6 border-t border-slate-100 pt-4">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Skriv et svar… (overtager fra Maria)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={sending || !reply.trim()}
                  onClick={() => void sendReply()}
                  className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sending ? 'Sender…' : 'Send svar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

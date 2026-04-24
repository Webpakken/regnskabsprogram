import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/context/AppProvider'
import { formatDateTime, formatSupportTicketNumber } from '@/lib/format'
import {
  canUseWebPush,
  hasWebPushSubscription,
  registerWebPushSubscriptionDetailed,
} from '@/lib/pushClient'
import { supabase } from '@/lib/supabase'
import { usePlatformAdminNotifications } from '@/hooks/usePlatformAdminNotifications'
import type { Database } from '@/types/database'

type Ticket = Database['public']['Tables']['support_tickets']['Row'] & {
  companies: { name: string; cvr: string | null } | null
}
type Message = Database['public']['Tables']['support_messages']['Row']

const statusLabels: Record<string, string> = {
  open: 'Åben',
  closed: 'Lukket',
  waiting_customer: 'Afventer kunde',
}

export function PlatformSupportPage() {
  const { user } = useApp()
  const { markSeen } = usePlatformAdminNotifications()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('support_tickets')
      .select('*, companies(name, cvr)')
      .order('updated_at', { ascending: false })
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setTickets((data ?? []) as Ticket[])
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    void markSeen('support')
  }, [markSeen])

  useEffect(() => {
    let cancelled = false
    async function loadPushStatus() {
      if (!canUseWebPush()) return
      const ok = await hasWebPushSubscription()
      if (!cancelled) setPushEnabled(ok)
    }
    void loadPushStatus()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  )

  const loadMessages = useCallback(async (ticketId: string) => {
    setMsgLoading(true)
    const { data, error: qErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    setMsgLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setMessages(data ?? [])
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    void loadMessages(selectedId)
  }, [selectedId, loadMessages])

  useEffect(() => {
    const ch = supabase.channel('platform-support-live')
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets' },
      () => {
        void loadTickets()
      },
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_messages' },
      () => {
        if (selectedId) void loadMessages(selectedId)
        void loadTickets()
      },
    )
    void ch.subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [loadMessages, loadTickets, selectedId])

  async function sendReply() {
    if (!selectedId || !user || !reply.trim()) return
    setSending(true)
    setError(null)
    setPushResult(null)
    const { error: insErr } = await supabase.from('support_messages').insert({
      ticket_id: selectedId,
      user_id: user.id,
      body: reply.trim(),
      is_staff: true,
    })
    if (insErr) {
      setError(insErr.message)
      setSending(false)
      return
    }
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', selectedId)
    setReply('')
    await loadMessages(selectedId)
    await loadTickets()
    setSending(false)
    void supabase.functions
      .invoke('support-push-notify', { body: { ticket_id: selectedId } })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[support-push-notify]', error.message)
          setPushResult(`Push-fejl: ${error.message}`)
          return
        }
        if (data && typeof data === 'object') {
          const d = data as { sent?: number; subscriptionCount?: number; firstError?: string }
          if ((d.subscriptionCount ?? 0) === 0) {
            setPushResult('Push: 0 abonnementer fundet for kunden.')
            console.info(
              '[push] Ingen push-abonnementer for virksomhedens medlemmer — kunden får ikke notifikation.',
            )
          } else if ((d.sent ?? 0) > 0) {
            setPushResult(
              `Push sendt til ${d.sent} enhed${(d.sent ?? 0) === 1 ? '' : 'er'}.`,
            )
          } else if ((d.sent ?? 0) === 0 && d.firstError) {
            setPushResult(`Push-fejl: ${d.firstError}`)
            console.warn('[support-push-notify] send', d.firstError)
          } else {
            setPushResult(
              `Push-resultat: ${d.sent ?? 0} sendt / ${d.subscriptionCount ?? 0} abonnementer.`,
            )
          }
        }
      })
  }

  async function setStatus(status: Ticket['status']) {
    if (!selectedId) return
    setError(null)
    const { error: uErr } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', selectedId)
    if (uErr) {
      setError(uErr.message)
      return
    }
    await loadTickets()
  }

  async function setConsent(value: boolean) {
    if (!selectedId) return
    setError(null)
    const { error: uErr } = await supabase
      .from('support_tickets')
      .update({
        consent_deep_access: value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedId)
    if (uErr) {
      setError(uErr.message)
      return
    }
    await loadTickets()
  }

  async function enablePush() {
    setPushBusy(true)
    setError(null)
    try {
      const result = await registerWebPushSubscriptionDetailed()
      setPushEnabled(result.ok)
      if (!result.ok) {
        setError(
          result.detail
            ? `Push-fejl (${result.stage}): ${result.detail}`
            : `Push-fejl (${result.stage}).`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push kunne ikke aktiveres.')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row">
      <div className="lg:w-80 lg:shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">Flere sager pr. virksomhed.</p>
        {canUseWebPush() && !pushEnabled ? (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Slå push til for support</p>
            <p className="mt-1 text-sm text-slate-600">
              Så får du besked, når kunder skriver, også når fanen ikke er aktiv.
            </p>
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void enablePush()}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {pushBusy ? 'Aktiverer…' : 'Slå push til'}
            </button>
          </div>
        ) : !canUseWebPush() ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Push er ikke konfigureret i denne app-build endnu.
          </div>
        ) : null}
        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Indlæser…</div>
          ) : tickets.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Ingen sager endnu.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                      selectedId === t.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {t.companies?.name ?? 'Virksomhed'}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {formatSupportTicketNumber(t.ticket_number)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {statusLabels[t.status] ?? t.status}
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
            Vælg en sag til venstre.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {selected.companies?.name ?? 'Virksomhed'}{' '}
                    <span className="font-mono text-sm font-normal text-slate-500">
                      {formatSupportTicketNumber(selected.ticket_number)}
                    </span>
                  </h2>
                  {selected.companies?.cvr ? (
                    <p className="text-sm text-slate-600">CVR {selected.companies.cvr}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">
                    Status{' '}
                    <select
                      value={selected.status}
                      onChange={(e) =>
                        void setStatus(e.target.value as Ticket['status'])
                      }
                      className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    >
                      <option value="open">Åben</option>
                      <option value="waiting_customer">Afventer kunde</option>
                      <option value="closed">Lukket</option>
                    </select>
                  </label>
                </div>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.consent_deep_access}
                  onChange={(e) => void setConsent(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Kunden har givet samtykke til dybere adgang (notér i processen)
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Beskeder</h3>
              {msgLoading ? (
                <div className="mt-4 text-sm text-slate-500">Indlæser…</div>
              ) : (
                <ul className="mt-4 space-y-4">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        m.is_staff
                          ? 'border-indigo-100 bg-indigo-50 text-slate-800'
                          : 'border-slate-100 bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                        <span>{m.is_staff ? 'Bilago' : 'Kunde'}</span>
                        <span>{formatDateTime(m.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 border-t border-slate-100 pt-4">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  placeholder="Skriv et svar…"
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
                {pushResult ? (
                  <p className="mt-3 text-sm text-slate-600">{pushResult}</p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

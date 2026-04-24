import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { useApp } from '@/context/AppProvider'
import { useSupportUnread } from '@/context/SupportUnreadContext'
import { formatDateTime, formatSupportTicketNumber } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Message = Database['public']['Tables']['support_messages']['Row']
type Ticket = Database['public']['Tables']['support_tickets']['Row']

const CLOSED_TICKETS_LIMIT = 10

function customerTicketStatusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Åben'
    case 'closed':
      return 'Afsluttet'
    case 'waiting_customer':
      return 'Afventer dit svar'
    default:
      return status
  }
}

function SupportMessageList({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-500">Ingen beskeder endnu.</p>
  }
  return (
    <ul className="space-y-4">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-xl border px-4 py-3 text-sm ${
            m.is_staff
              ? 'border-indigo-100 bg-indigo-50 text-slate-800'
              : 'border-slate-200 bg-white text-slate-800 shadow-sm'
          }`}
        >
          <div className="flex justify-between gap-2 text-xs text-slate-500">
            <span>{m.is_staff ? 'Bilago' : 'Dig'}</span>
            <span>{formatDateTime(m.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
        </li>
      ))}
    </ul>
  )
}

export function SupportPage() {
  const { currentCompany, user } = useApp()
  const { refresh: refreshUnread } = useSupportUnread()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [messagesByTicket, setMessagesByTicket] = useState<Record<string, Message[]>>({})
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThread = useCallback(
    async (companyId: string) => {
      setLoading(true)
      setError(null)
      const { data: ticketRows, error: tErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (tErr) {
        setError(tErr.message)
        setLoading(false)
        return
      }
      const ts = ticketRows ?? []
      setTickets(ts)

      if (ts.length === 0) {
        setMessagesByTicket({})
      } else {
        const ticketIds = ts.map((t) => t.id)
        const { data: msgRows, error: mErr } = await supabase
          .from('support_messages')
          .select('*')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: true })
        if (mErr) {
          setError(mErr.message)
          setLoading(false)
          return
        }
        const grouped: Record<string, Message[]> = {}
        for (const m of msgRows ?? []) {
          ;(grouped[m.ticket_id] ??= []).push(m)
        }
        setMessagesByTicket(grouped)
      }

      await supabase.rpc('support_mark_ticket_read', { p_company_id: companyId })
      void refreshUnread()
      setLoading(false)
    },
    [refreshUnread],
  )

  useEffect(() => {
    if (!currentCompany) return
    void loadThread(currentCompany.id)
  }, [currentCompany, loadThread])

  useEffect(() => {
    if (!currentCompany) return

    const ch = supabase.channel(`support-live:${currentCompany.id}`)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${currentCompany.id}` },
      () => {
        void loadThread(currentCompany.id)
      },
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_messages' },
      () => {
        void loadThread(currentCompany.id)
      },
    )
    void ch.subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [currentCompany?.id, loadThread])

  const activeTicket = useMemo(
    () => tickets.find((t) => t.status !== 'closed') ?? null,
    [tickets],
  )
  const closedTickets = useMemo(
    () => tickets.filter((t) => t.status === 'closed').slice(0, CLOSED_TICKETS_LIMIT),
    [tickets],
  )

  async function send() {
    if (!user || !body.trim() || !currentCompany) return
    setSending(true)
    setError(null)

    let ticketId = activeTicket?.id ?? null
    if (!ticketId) {
      const { data: newTicket, error: insTicketErr } = await supabase
        .from('support_tickets')
        .insert({ company_id: currentCompany.id })
        .select('*')
        .single()
      if (insTicketErr || !newTicket) {
        setError(insTicketErr?.message ?? 'Kunne ikke oprette ny sag.')
        setSending(false)
        return
      }
      ticketId = newTicket.id
    }

    const { error: insErr } = await supabase.from('support_messages').insert({
      ticket_id: ticketId,
      user_id: user.id,
      body: body.trim(),
      is_staff: false,
    })
    if (insErr) {
      setError(insErr.message)
      setSending(false)
      return
    }
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId)
    setBody('')
    await loadThread(currentCompany.id)
    setSending(false)
    void supabase.functions
      .invoke('support-push-customer-notify', { body: { ticket_id: ticketId } })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[support-push-customer-notify]', error.message)
          return
        }
        if (data && typeof data === 'object' && 'subscriptionCount' in data) {
          const d = data as { sent?: number; subscriptionCount?: number; firstError?: string }
          if ((d.subscriptionCount ?? 0) === 0) {
            console.info(
              '[push] Ingen registrerede enheder hos Bilago-team — notifikation kan ikke sendes.',
            )
          } else if ((d.sent ?? 0) === 0 && d.firstError) {
            console.warn('[support-push-customer-notify] send', d.firstError)
          }
        }
      })
  }

  if (!currentCompany) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <AppPageLayout maxWidth="2xl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vi svarer på hverdage. Når en sag er afsluttet, starter en ny besked en ny sag.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">Indlæser…</div>
      ) : (
        <>
          {activeTicket ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  Sag {formatSupportTicketNumber(activeTicket.ticket_number)}
                </h2>
                <p className="text-xs text-slate-500">
                  Status:{' '}
                  <span className="font-medium text-slate-700">
                    {customerTicketStatusLabel(activeTicket.status)}
                  </span>
                </p>
              </div>
              <SupportMessageList messages={messagesByTicket[activeTicket.id] ?? []} />
            </section>
          ) : tickets.length > 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Alle tidligere sager er afsluttet. Skriv nedenfor for at starte en ny sag.
            </p>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-medium text-slate-600">
              {activeTicket ? 'Ny besked' : 'Start en ny sag'}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Beskriv dit spørgsmål…"
            />
            <button
              type="button"
              disabled={sending || !body.trim()}
              onClick={() => void send()}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? 'Sender…' : 'Send'}
            </button>
          </div>

          {closedTickets.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Tidligere sager</h2>
              <ul className="space-y-2">
                {closedTickets.map((t) => {
                  const msgs = messagesByTicket[t.id] ?? []
                  return (
                    <li key={t.id}>
                      <details className="rounded-xl border border-slate-200 bg-slate-50/90">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800">
                          Sag {formatSupportTicketNumber(t.ticket_number)}
                          <span className="ml-2 font-normal text-slate-500">
                            afsluttet {formatDateTime(t.updated_at)}
                          </span>
                          {msgs.length > 0 ? (
                            <span className="ml-2 font-normal text-slate-500">
                              · {msgs.length} {msgs.length === 1 ? 'besked' : 'beskeder'}
                            </span>
                          ) : null}
                        </summary>
                        <div className="border-t border-slate-200 px-2 pb-3 pt-3">
                          <SupportMessageList messages={msgs} />
                        </div>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AppPageLayout>
  )
}

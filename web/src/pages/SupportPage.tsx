import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { useSupportUnread } from '@/context/SupportUnreadContext'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Message = Database['public']['Tables']['support_messages']['Row']
type Ticket = Database['public']['Tables']['support_tickets']['Row']

export function SupportPage() {
  const { currentCompany, user } = useApp()
  const { refresh: refreshUnread } = useSupportUnread()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThread = useCallback(async (companyId: string) => {
    setLoading(true)
    setError(null)
    const first = await supabase
      .from('support_tickets')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
    if (first.error) {
      setError(first.error.message)
      setLoading(false)
      return
    }
    let ticketRow = first.data
    if (!ticketRow) {
      const ins = await supabase
        .from('support_tickets')
        .insert({ company_id: companyId })
        .select('*')
        .single()
      if (ins.error) {
        const retry = await supabase
          .from('support_tickets')
          .select('*')
          .eq('company_id', companyId)
          .maybeSingle()
        if (retry.error || !retry.data) {
          setError(ins.error.message)
          setLoading(false)
          return
        }
        ticketRow = retry.data
      } else {
        ticketRow = ins.data
      }
    }
    setTicket(ticketRow)
    const { data: msgs, error: mErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketRow.id)
      .order('created_at', { ascending: true })
    if (mErr) {
      setError(mErr.message)
      setLoading(false)
      return
    }
    setMessages(msgs ?? [])
    await supabase.rpc('support_mark_ticket_read', { p_company_id: companyId })
    void refreshUnread()
    setLoading(false)
  }, [refreshUnread])

  useEffect(() => {
    if (!currentCompany) return
    void loadThread(currentCompany.id)
  }, [currentCompany, loadThread])

  async function send() {
    if (!ticket || !user || !body.trim()) return
    setSending(true)
    setError(null)
    const { error: insErr } = await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
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
      .eq('id', ticket.id)
    setBody('')
    await loadThread(currentCompany!.id)
    setSending(false)
    void supabase.functions
      .invoke('support-push-customer-notify', { body: { ticket_id: ticket.id } })
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-600">
          Én samtale pr. virksomhed. Vi svarer på hverdage.
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
          {ticket ? (
            <p className="text-xs text-slate-500">
              Status:{' '}
              <span className="font-medium text-slate-700">{ticket.status}</span>
            </p>
          ) : null}

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

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-medium text-slate-600">Ny besked</label>
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
        </>
      )}
    </div>
  )
}

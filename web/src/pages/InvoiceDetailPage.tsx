import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { sendInvoiceToCustomerEmail } from '@/lib/invoiceCustomerEmail'
import { copenhagenYmd, formatDate, formatDateTime, formatDkk } from '@/lib/format'
import { activityDisplayTitle } from '@/lib/activityDisplay'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Activity = Database['public']['Tables']['activity_events']['Row']

type DetailTab = 'faktura' | 'udsendelser' | 'betalinger'

function metaInvoiceId(meta: Activity['meta']): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const id = (meta as { invoice_id?: unknown }).invoice_id
  return typeof id === 'string' ? id : null
}

function isCreditNote(inv: Invoice) {
  return inv.credited_invoice_id != null || inv.gross_cents < 0
}

function isOverdue(inv: Invoice): boolean {
  if (inv.status !== 'sent') return false
  const due = String(inv.due_date).slice(0, 10)
  return due < copenhagenYmd()
}

function invoiceDispatchEvents(events: Activity[], invoiceId: string): Activity[] {
  const types = new Set(['invoice_sent', 'invoice_reminder_auto', 'invoice_dunning'])
  return events.filter((a) => {
    if (!types.has(a.event_type)) return false
    return metaInvoiceId(a.meta) === invoiceId
  })
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentCompany, refresh } = useApp()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('faktura')
  const [menuOpen, setMenuOpen] = useState(false)
  const [markBusy, setMarkBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  useEffect(() => {
    setNotice(null)
  }, [id])

  useEffect(() => {
    if (!id || !currentCompany) {
      setLoading(false)
      return
    }
    let c = false
    void (async () => {
      setLoading(true)
      setError(null)
      const [{ data: inv, error: e1 }, { data: act }] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).eq('company_id', currentCompany.id).maybeSingle(),
        supabase
          .from('activity_events')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false })
          .limit(400),
      ])
      if (c) return
      if (e1 || !inv) {
        setError('Faktura ikke fundet')
        setInvoice(null)
        setLoading(false)
        return
      }
      setInvoice(inv as Invoice)
      setActivity(act ?? [])
      setLoading(false)
    })()
    return () => {
      c = true
    }
  }, [id, currentCompany])

  async function reloadInvoice() {
    if (!id || !currentCompany) return
    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('company_id', currentCompany.id)
      .maybeSingle()
    if (inv) setInvoice(inv as Invoice)
    const { data: act } = await supabase
      .from('activity_events')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false })
      .limit(400)
    setActivity(act ?? [])
  }

  async function markPaid() {
    if (!invoice || !currentCompany || !id) return
    if (!window.confirm('Markér denne faktura som betalt?')) return
    setMarkBusy(true)
    setNotice(null)
    try {
      const { error: uErr } = await supabase
        .from('invoices')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', currentCompany.id)
      if (uErr) throw new Error(uErr.message)
      await logActivity(currentCompany.id, 'invoice_paid', `Faktura ${invoice.invoice_number} markeret betalt`, {
        invoice_id: id,
      })
      setNotice('Faktura markeret som betalt.')
      await reloadInvoice()
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Kunne ikke opdatere')
    } finally {
      setMarkBusy(false)
    }
  }

  async function resendInvoice() {
    if (!invoice || !currentCompany) return
    if (invoice.status === 'draft') {
      navigate(`/app/invoices/${id}/edit`)
      return
    }
    const to = invoice.customer_email?.trim()
    if (!to) {
      setNotice('Kundens e-mail mangler.')
      return
    }
    if (!window.confirm('Send fakturaen til kunden på ny som e-mail?')) return
    setSendBusy(true)
    setNotice(null)
    try {
      await sendInvoiceToCustomerEmail({
        company: currentCompany,
        invoiceId: invoice.id,
        kind: 'invoice_sent',
      })
      setNotice('Faktura sendt til kunden (hvis skabelon er slået til).')
      await reloadInvoice()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Kunne ikke sende')
    } finally {
      setSendBusy(false)
    }
  }

  async function sendReminder() {
    if (!invoice || !currentCompany) return
    const to = invoice.customer_email?.trim()
    if (!to) {
      setNotice('Kundens e-mail mangler.')
      return
    }
    if (!window.confirm('Send betalingspåmindelse til kunden?')) return
    setReminderBusy(true)
    setNotice(null)
    try {
      await sendInvoiceToCustomerEmail({
        company: currentCompany,
        invoiceId: invoice.id,
        kind: 'invoice_reminder',
      })
      setNotice('Påmindelse sendt (hvis skabelon er slået til).')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Kunne ikke sende')
    } finally {
      setReminderBusy(false)
    }
  }

  if (!currentCompany) {
    return (
      <p className="p-4 text-slate-600">
        Vælg virksomhed.{' '}
        <Link to="/app/invoices" className="text-indigo-600">
          Tilbage
        </Link>
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Indlæser…
      </div>
    )
  }

  if (error || !invoice || !id) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-rose-600">{error ?? 'Ukendt fejl'}</p>
        <Link to="/app/invoices" className="text-sm font-medium text-indigo-600">
          ← Tilbage til fakturaer
        </Link>
      </div>
    )
  }

  const credit = isCreditNote(invoice)
  const overdue = isOverdue(invoice)
  const dispatchList = invoiceDispatchEvents(activity, id)
  const paidCents = invoice.status === 'paid' ? invoice.gross_cents : 0
  const restCents = invoice.gross_cents - paidCents
  const canMarkPaid = invoice.status === 'sent' && !credit
  const num = String(invoice.invoice_number ?? '').trim() || '—'

  const statusLine = (() => {
    if (invoice.status === 'draft') return { text: 'Kladde', className: 'text-slate-600' }
    if (invoice.status === 'paid') return { text: 'Betalt', className: 'text-emerald-600' }
    if (invoice.status === 'cancelled') return { text: 'Annulleret', className: 'text-slate-500' }
    if (credit) return { text: 'Kreditnota', className: 'text-rose-700' }
    if (overdue) return { text: 'Forfalden', className: 'text-rose-600 font-semibold' }
    return { text: 'Sendt', className: 'text-slate-700' }
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 pb-6">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/app/invoices')}
            className="shrink-0 text-sm font-semibold text-sky-600 hover:text-sky-800"
          >
            ← Fakturaer
          </button>
          <h1 className="min-w-0 truncate text-center text-base font-semibold text-slate-900">
            Faktura {num}
          </h1>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            >
              <IconDots />
            </button>
            {menuOpen ? (
              <ul
                className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
                role="menu"
              >
                <li>
                  <Link
                    role="menuitem"
                    className="block px-4 py-2.5 text-slate-800 hover:bg-slate-50"
                    to={`/app/invoices/${id}/edit`}
                    onClick={() => setMenuOpen(false)}
                  >
                    Rediger
                  </Link>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    className="block px-4 py-2.5 text-slate-800 hover:bg-slate-50"
                    to={`/app/invoices/${id}/pdf`}
                    onClick={() => setMenuOpen(false)}
                  >
                    Åbn PDF
                  </Link>
                </li>
                {!credit ? (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-4 py-2.5 text-left text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false)
                        navigate(`/app/invoices/new?creditFor=${id}`)
                      }}
                    >
                      Opret kreditnota
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-lg rounded-xl bg-slate-200/90 p-1">
          <div className="grid grid-cols-3 gap-0.5">
            {(
              [
                ['faktura', 'Faktura'],
                ['udsendelser', 'Udsendelser'],
                ['betalinger', 'Betalinger'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-lg py-2.5 text-center text-xs font-semibold sm:text-sm ${
                  tab === key
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 pt-4">
        {notice ? (
          <p className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {notice}
          </p>
        ) : null}

        {tab === 'faktura' ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kunde</p>
                  <p className="mt-1 truncate text-lg font-semibold text-slate-900">{invoice.customer_name}</p>
                </div>
                <Link
                  to={`/app/invoices/${id}/pdf`}
                  className="flex shrink-0 flex-col items-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                >
                  <IconPdf />
                  PDF
                </Link>
              </div>
              <div className="px-4 py-4">
                <p className="text-xs text-slate-500">Total</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                  {formatDkk(invoice.gross_cents, invoice.currency)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Faktura: <span className={statusLine.className}>{statusLine.text}</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Dato</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDate(invoice.issue_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Forfaldsdato</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDate(invoice.due_date)}</p>
                </div>
              </div>
              {canMarkPaid ? (
                <div className="border-t border-slate-100 p-4">
                  <button
                    type="button"
                    disabled={markBusy}
                    onClick={() => void markPaid()}
                    className="w-full rounded-xl bg-sky-500 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-60"
                  >
                    {markBusy ? 'Gemmer…' : 'Registrér betaling'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <IconAction
                label="Send"
                disabled={sendBusy}
                onClick={() => void resendInvoice()}
                icon={<IconSend />}
              />
              {invoice.customer_email?.trim() ? (
                <IconAction
                  label="Skriv"
                  as="a"
                  href={`mailto:${invoice.customer_email.trim()}`}
                  icon={<IconMail />}
                />
              ) : (
                <IconAction label="Skriv" disabled icon={<IconMail />} />
              )}
              <IconAction
                label="Påmind"
                disabled={reminderBusy || invoice.status === 'draft' || !invoice.customer_email?.trim()}
                onClick={() => void sendReminder()}
                icon={<IconBell />}
              />
              <IconAction
                label="Kredit"
                disabled={credit}
                onClick={() => navigate(`/app/invoices/new?creditFor=${id}`)}
                icon={<IconCredit />}
              />
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fakturaadresse</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{invoice.customer_name}</p>
              {invoice.customer_email ? (
                <p className="mt-0.5 text-sm text-slate-600">{invoice.customer_email}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'udsendelser' ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Historik</p>
            {dispatchList.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Ingen registrerede udsendelser endnu. Når du sender faktura eller påmindelse, vises det her.
              </p>
            ) : (
              dispatchList.map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-sky-700">
                      {invoice.customer_email ?? 'E-mail'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">{activityDisplayTitle(a)}</p>
                  <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt>Sendt</dt>
                      <dd className="font-medium text-slate-800">{formatDateTime(a.created_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Kanal</dt>
                      <dd className="font-medium text-slate-800">E-mail</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Åbning</dt>
                      <dd className="font-medium text-sky-700">Ikke målt</dd>
                    </div>
                  </dl>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === 'betalinger' ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="divide-y divide-slate-100 px-4 py-1 text-sm">
              <div className="flex justify-between py-3">
                <span className="text-slate-600">Faktura i alt</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {formatDkk(invoice.gross_cents, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-slate-600">Indbetalt</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {formatDkk(paidCents, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-900">Restbeløb</span>
                <span className="tabular-nums font-bold text-slate-900">
                  {formatDkk(restCents, invoice.currency)}
                </span>
              </div>
            </div>
            {canMarkPaid ? (
              <div className="border-t border-slate-100 p-4">
                <button
                  type="button"
                  disabled={markBusy}
                  onClick={() => void markPaid()}
                  className="w-full rounded-xl bg-sky-500 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-60"
                >
                  {markBusy ? 'Gemmer…' : 'Registrér betaling'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function IconDots() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  )
}

function IconPdf() {
  return (
    <svg className="mb-1 h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M10 12h4M10 16h4M10 8h1" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg className="mx-auto h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg className="mx-auto h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg className="mx-auto h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 7h12s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function IconCredit() {
  return (
    <svg className="mx-auto h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M12 18v-6M9 15h6" />
    </svg>
  )
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  href,
  as,
}: {
  label: string
  icon: ReactNode
  disabled?: boolean
  onClick?: () => void
  href?: string
  as?: 'a'
}) {
  const cls =
    'flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 disabled:cursor-not-allowed disabled:opacity-40'
  if (as === 'a' && href) {
    return (
      <a href={href} className={cls}>
        {icon}
        <span className="mt-1">{label}</span>
      </a>
    )
  }
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="mt-1">{label}</span>
    </button>
  )
}

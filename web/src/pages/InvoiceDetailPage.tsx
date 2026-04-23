import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { LoadingCentered } from '@/components/LoadingIndicator'
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
      setNotice(
        'Kladder kan ikke ændres efter oprettelse. Opret en ny faktura i menuen, hvis du skal lave et nyt udkast.',
      )
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
      <LoadingCentered
        className="flex flex-1"
        minHeight="min-h-[min(70vh,520px)]"
        srLabel="Indlæser faktura"
      />
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
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 pb-8">
      <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white px-4 pb-0 pt-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/app/invoices')}
            className="shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            ← Fakturaer
          </button>
          <h1 className="min-w-0 truncate text-center text-base font-semibold tracking-tight text-slate-900">
            Faktura {num}
          </h1>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-800"
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

        <nav
          className="mx-auto mt-3 flex max-w-lg gap-1 border-b border-slate-200"
          aria-label="Fakturafaner"
        >
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
              className={clsx(
                'relative flex-1 pb-3 pt-1 text-center text-sm font-semibold transition',
                tab === key ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {label}
              {tab === key ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-indigo-600"
                  aria-hidden
                />
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 pt-5">
        {notice ? (
          <p className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2.5 text-sm text-indigo-950">
            {notice}
          </p>
        ) : null}

        {tab === 'faktura' ? (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex gap-4 px-4 py-5">
                <div
                  className="w-1 shrink-0 self-stretch rounded-full bg-indigo-600"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Kunde</p>
                      <p className="mt-0.5 text-lg font-semibold text-slate-900">{invoice.customer_name}</p>
                    </div>
                    <Link
                      to={`/app/invoices/${id}/pdf`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      <IconPdfSmall />
                      Se PDF
                    </Link>
                  </div>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Beløb inkl. moms
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                    {formatDkk(invoice.gross_cents, invoice.currency)}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Status
                    </span>
                    <span className={statusLine.className}>{statusLine.text}</span>
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Udstedt</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">{formatDate(invoice.issue_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Forfald</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">{formatDate(invoice.due_date)}</dd>
                </div>
              </dl>
              {canMarkPaid ? (
                <div className="border-t border-slate-100 p-4">
                  <button
                    type="button"
                    disabled={markBusy}
                    onClick={() => void markPaid()}
                    className="w-full rounded-xl bg-indigo-600 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {markBusy ? 'Gemmer…' : 'Registrér betaling'}
                  </button>
                </div>
              ) : null}
            </section>

            <section>
              <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Handlinger
              </h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <ActionRow
                  icon={<IconSend className="text-indigo-600" />}
                  title="Send til kunde"
                  subtitle={
                    invoice.status === 'draft' ? 'Fortsæt i redigering' : 'Gensend faktura på e-mail'
                  }
                  disabled={sendBusy}
                  onClick={() => void resendInvoice()}
                />
                {invoice.customer_email?.trim() ? (
                  <ActionRow
                    icon={<IconMail className="text-indigo-600" />}
                    title="Skriv til kunde"
                    subtitle={invoice.customer_email.trim()}
                    href={`mailto:${invoice.customer_email.trim()}`}
                  />
                ) : (
                  <ActionRow
                    icon={<IconMail className="text-slate-400" />}
                    title="Skriv til kunde"
                    subtitle="E-mail mangler"
                    disabled
                  />
                )}
                <ActionRow
                  icon={<IconBell className="text-indigo-600" />}
                  title="Betalingspåmindelse"
                  subtitle="E-mail fra jeres skabelon"
                  disabled={
                    reminderBusy || invoice.status === 'draft' || !invoice.customer_email?.trim()
                  }
                  onClick={() => void sendReminder()}
                />
                <ActionRow
                  icon={<IconCredit className={credit ? 'text-slate-400' : 'text-indigo-600'} />}
                  title="Kreditnota"
                  subtitle={credit ? 'Kan ikke krediteres igen' : 'Modregning af denne faktura'}
                  disabled={credit}
                  onClick={() => navigate(`/app/invoices/new?creditFor=${id}`)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fakturaadresse</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{invoice.customer_name}</p>
              {invoice.customer_email ? (
                <p className="mt-0.5 text-sm text-slate-600">{invoice.customer_email}</p>
              ) : (
                <p className="mt-0.5 text-sm text-amber-700">
                  Ingen e-mail — fakturaer kan ikke ændres efter oprettelse
                </p>
              )}
            </section>
          </div>
        ) : null}

        {tab === 'udsendelser' ? (
          <div>
            <h2 className="mb-3 px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tidslinje for e-mail
            </h2>
            {dispatchList.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                Ingen registrerede udsendelser endnu. Når du sender faktura eller påmindelse, vises det her.
              </p>
            ) : (
              <ol className="relative mx-2 border-l-2 border-indigo-200 pl-6">
                {dispatchList.map((a) => (
                  <li key={a.id} className="relative pb-8 last:pb-0">
                    <span
                      className="absolute -left-[calc(0.5rem+5px)] top-1.5 flex h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-600 ring-2 ring-indigo-100"
                      aria-hidden
                    />
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                      <p className="text-sm font-medium text-slate-900">{activityDisplayTitle(a)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
                      <dl className="mt-2 space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between gap-2">
                          <dt>Kanal</dt>
                          <dd className="font-medium text-slate-800">E-mail</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Åbning</dt>
                          <dd className="font-medium text-slate-500">Ikke målt</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        {tab === 'betalinger' ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-indigo-50/50 px-4 py-3">
                <h2 className="text-sm font-semibold text-indigo-950">Betalingsstatus</h2>
                <p className="mt-0.5 text-xs text-indigo-900/80">Beløb i virksomhedens valuta</p>
              </div>
              <div className="divide-y divide-slate-100 px-4 py-0 text-sm">
                <div className="flex justify-between py-3.5">
                  <span className="text-slate-600">Faktura i alt</span>
                  <span className="tabular-nums font-medium text-slate-900">
                    {formatDkk(invoice.gross_cents, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between py-3.5">
                  <span className="text-slate-600">Indbetalt</span>
                  <span className="tabular-nums font-medium text-slate-900">
                    {formatDkk(paidCents, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-indigo-100 bg-indigo-50/40 py-3.5 -mx-4 px-4">
                  <span className="font-semibold text-indigo-950">Restbeløb</span>
                  <span className="tabular-nums font-bold text-indigo-950">
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
                    className="w-full rounded-xl bg-indigo-600 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {markBusy ? 'Gemmer…' : 'Registrér betaling'}
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ActionRow({
  icon,
  title,
  subtitle,
  disabled,
  onClick,
  href,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  disabled?: boolean
  onClick?: () => void
  href?: string
}) {
  const rowClass = clsx(
    'flex w-full items-center gap-3 px-4 py-3.5 text-left transition',
    href
      ? 'hover:bg-indigo-50/70'
      : 'hover:bg-indigo-50/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
  )
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitle}</span>
      </span>
      <span className="shrink-0 text-slate-300" aria-hidden>
        ›
      </span>
    </>
  )
  if (href) {
    return (
      <a href={href} className={rowClass}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" className={rowClass} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  )
}

function IconDots() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  )
}

function IconPdfSmall() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M10 12h4M10 16h4M10 8h1" />
    </svg>
  )
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('h-5 w-5 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('h-5 w-5 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('h-5 w-5 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 7h12s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function IconCredit({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('h-5 w-5 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M12 18v-6M9 15h6" />
    </svg>
  )
}

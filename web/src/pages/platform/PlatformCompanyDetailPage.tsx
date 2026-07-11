import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDate, formatDateTime, formatDkk } from '@/lib/format'

type Company = {
  id: string
  name: string
  cvr: string | null
  entity_type?: string | null
  base_currency?: string | null
  street_address?: string | null
  postal_code?: string | null
  city?: string | null
  invoice_email?: string | null
  trial_ends_at?: string | null
  created_at: string
}

const DAY_MS = 86_400_000
const TRIAL_DAYS = 30

/** Effektiv prøveperiode-slutdato: override hvis sat, ellers created_at + 30 dage. */
function effectiveTrialEnd(company: { created_at: string; trial_ends_at?: string | null }): Date {
  if (company.trial_ends_at) return new Date(company.trial_ends_at)
  return new Date(new Date(company.created_at).getTime() + TRIAL_DAYS * DAY_MS)
}

type Subscription = {
  status: string
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan_name: string | null
  monthly_price_cents: number | null
  updated_at: string | null
} | null

type Owner = {
  user_id: string
  full_name: string | null
  email: string | null
  member_since: string | null
} | null

type Member = {
  user_id: string
  full_name: string | null
  email: string | null
  role: string
  created_at: string
}

type Payment = {
  id: string
  invoice_number: string
  gross_cents: number
  net_cents: number
  vat_cents: number
  currency: string
  plan_name: string | null
  period_start: string | null
  period_end: string | null
  voucher_id: string | null
  issued_at: string
}

type Detail = {
  company: Company
  subscription: Subscription
  owner: Owner
  members: Member[]
  payments: Payment[]
}

type StripePayment = {
  id: string
  invoice_number: string
  gross_cents: number
  currency: string
  paid_at: string
  period_start: string | null
  period_end: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

type StripeBilling = {
  subscription: { status: string | null; current_period_end: string | null } | null
  payments: StripePayment[]
  issued: number
  skipped: number
}

const SUBSCRIPTION_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  trialing: { label: 'Prøveperiode', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  past_due: { label: 'Forfalden', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  unpaid: { label: 'Ubetalt', cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  canceled: { label: 'Opsagt', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  incomplete: { label: 'Ufuldstændig', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value ?? '—'}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function PlatformCompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const navigate = useNavigate()
  const { refresh } = useApp()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [billing, setBilling] = useState<StripeBilling | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [extending, setExtending] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase.rpc('get_platform_company_detail', {
      p_company_id: companyId,
    })
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setDetail(data as unknown as Detail)
  }, [companyId])

  // Live betalinger + fornyelsesdato fra Stripe (read-only, ingen bivirkninger).
  const loadBilling = useCallback(async () => {
    if (!companyId) return
    setBillingLoading(true)
    const { data, error: fnErr } = await supabase.functions.invoke('platform-stripe-billing', {
      body: { company_id: companyId, action: 'read' },
    })
    setBillingLoading(false)
    if (fnErr) return
    setBilling(data as StripeBilling)
  }, [companyId])

  async function backfillInvoices() {
    if (!companyId) return
    if (
      !window.confirm(
        'Udsted Bilago-fakturaer for alle kundens Stripe-betalinger?\n\nDette opretter bilag OG sender en kvittering på mail til kunden for hver betaling. Kan ikke fortrydes.',
      )
    )
      return
    setBackfilling(true)
    setError(null)
    const { data, error: fnErr } = await supabase.functions.invoke('platform-stripe-billing', {
      body: { company_id: companyId, action: 'backfill' },
    })
    setBackfilling(false)
    if (fnErr) {
      setError(fnErr.message)
      return
    }
    setBilling(data as StripeBilling)
    await load()
  }

  useEffect(() => {
    void load()
    void loadBilling()
  }, [load, loadBilling])

  async function extendTrial(days: number) {
    if (!companyId || extending) return
    setExtending(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('extend_company_trial', {
      p_company_id: companyId,
      p_days: days,
    })
    setExtending(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    await load()
    await loadBilling()
  }

  async function openAsCompany() {
    if (!companyId) return
    setBusy(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('begin_platform_impersonation', {
      p_company_id: companyId,
    })
    setBusy(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    await refresh()
    navigate('/app/dashboard')
  }

  const company = detail?.company
  const sub = detail?.subscription
  const owner = detail?.owner
  const subMeta = sub ? SUBSCRIPTION_LABELS[sub.status] : null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/platform/companies"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <span aria-hidden>←</span> Virksomheder
        </Link>
        {company ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void openAsCompany()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Åbner…' : 'Åbn som virksomhed'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Indlæser…
        </div>
      ) : !company ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Virksomhed ikke fundet.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{company.name}</h1>
            <span
              className={
                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ' +
                (company.entity_type === 'forening'
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-100'
                  : 'bg-slate-100 text-slate-600 ring-slate-200')
              }
            >
              {company.entity_type === 'forening' ? 'Forening' : 'Virksomhed'}
            </span>
          </div>

          <Card title="Oplysninger">
            <InfoRow label="Navn" value={company.name} />
            <InfoRow label="CVR" value={company.cvr ?? '—'} />
            <InfoRow
              label="Adresse"
              value={
                [company.street_address, [company.postal_code, company.city].filter(Boolean).join(' ')]
                  .filter((s) => s && String(s).trim())
                  .join(', ') || '—'
              }
            />
            <InfoRow label="Faktura-e-mail" value={company.invoice_email ?? '—'} />
            <InfoRow label="Valuta" value={company.base_currency ?? 'DKK'} />
            <InfoRow label="Oprettet" value={formatDate(company.created_at)} />
          </Card>

          <Card title="Opretter (ejer)">
            {owner ? (
              <>
                <InfoRow label="Navn" value={owner.full_name ?? '—'} />
                <InfoRow label="E-mail" value={owner.email ?? '—'} />
                <InfoRow
                  label="Medlem siden"
                  value={owner.member_since ? formatDate(owner.member_since) : '—'}
                />
              </>
            ) : (
              <p className="py-2 text-sm text-slate-500">Ingen ejer registreret.</p>
            )}
          </Card>

          <Card title="Abonnement">
            {sub ? (
              <>
                <InfoRow
                  label="Status"
                  value={
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
                        (subMeta?.cls ?? 'bg-slate-100 text-slate-600 ring-slate-200')
                      }
                    >
                      {subMeta?.label ?? sub.status}
                    </span>
                  }
                />
                <InfoRow label="Plan" value={sub.plan_name ?? '—'} />
                <InfoRow
                  label="Pris/md."
                  value={
                    sub.monthly_price_cents != null
                      ? formatDkk(sub.monthly_price_cents, company.base_currency ?? 'DKK')
                      : '—'
                  }
                />
                <InfoRow
                  label="Fornyes"
                  value={(() => {
                    const cpe = billing?.subscription?.current_period_end ?? sub.current_period_end
                    if (cpe) return formatDate(cpe)
                    return billingLoading ? 'Henter…' : '—'
                  })()}
                />
                <InfoRow label="Stripe-kunde" value={sub.stripe_customer_id ?? '—'} />
              </>
            ) : (
              <p className="py-2 text-sm text-slate-500">Intet abonnement — sandsynligvis på prøveperiode uden betaling.</p>
            )}

            {/* Forlæng prøveperiode (platform-staff) — kun relevant for ikke-betalende kunder. */}
            {(() => {
              // Er kunden begyndt at betale? Så er prøveperiode/forlæng irrelevant.
              const paying =
                sub?.status === 'active' ||
                sub?.status === 'past_due' ||
                billing?.subscription?.status === 'active' ||
                (billing?.payments?.length ?? 0) > 0 ||
                (detail?.payments?.length ?? 0) > 0
              if (paying) return null

              const end = effectiveTrialEnd(company)
              const expired = end.getTime() <= Date.now()
              const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / DAY_MS))
              return (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <InfoRow
                    label="Prøveperiode slutter"
                    value={
                      <span className={expired ? 'text-rose-600' : undefined}>
                        {formatDate(end.toISOString())}
                        {company.trial_ends_at ? ' (forlænget)' : ''}
                        {expired ? ' — udløbet' : ` — ${daysLeft} dag${daysLeft === 1 ? '' : 'e'} tilbage`}
                      </span>
                    }
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">Forlæng:</span>
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={extending}
                        onClick={() => void extendTrial(d)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        +{d} dage
                      </button>
                    ))}
                    {extending ? <span className="text-sm text-slate-400">Forlænger…</span> : null}
                  </div>
                </div>
              )
            })()}
          </Card>

          <Card title="Betalingshistorik">
            {billingLoading && !billing ? (
              <p className="py-2 text-sm text-slate-500">Henter betalinger fra Stripe…</p>
            ) : billing && billing.payments.length > 0 ? (
              <>
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-1 py-2">Faktura</th>
                        <th className="px-1 py-2">Betalt</th>
                        <th className="hidden px-1 py-2 sm:table-cell">Periode</th>
                        <th className="px-1 py-2 text-right">Beløb</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billing.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-1 py-2 font-medium text-slate-900">
                            {p.hosted_invoice_url ? (
                              <a
                                href={p.hosted_invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 hover:underline"
                              >
                                {p.invoice_number}
                              </a>
                            ) : (
                              p.invoice_number
                            )}
                          </td>
                          <td className="px-1 py-2 text-slate-600">{formatDate(p.paid_at)}</td>
                          <td className="hidden px-1 py-2 text-slate-600 sm:table-cell">
                            {p.period_start && p.period_end
                              ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}`
                              : '—'}
                          </td>
                          <td className="px-1 py-2 text-right font-medium text-slate-900">
                            {formatDkk(p.gross_cents, p.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">
                    Hentet direkte fra Stripe. Udsted Bilago-fakturaer for at oprette bilag og maile
                    kvitteringer til kunden.
                  </p>
                  <button
                    type="button"
                    onClick={() => void backfillInvoices()}
                    disabled={backfilling}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {backfilling ? 'Udsteder…' : 'Udsted Bilago-fakturaer'}
                  </button>
                </div>
              </>
            ) : (
              <p className="py-2 text-sm text-slate-500">Ingen betalinger fundet i Stripe.</p>
            )}
          </Card>

          {detail && detail.members.length > 0 ? (
            <Card title={`Brugere (${detail.members.length})`}>
              <ul className="divide-y divide-slate-100">
                {detail.members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {m.full_name ?? m.email ?? m.user_id}
                      </div>
                      {m.email ? (
                        <div className="truncate text-xs text-slate-500">{m.email}</div>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                      {m.role === 'owner' ? 'Ejer' : 'Bruger'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {sub?.updated_at ? (
            <p className="px-1 text-xs text-slate-400">
              Abonnement senest opdateret {formatDateTime(sub.updated_at)}.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

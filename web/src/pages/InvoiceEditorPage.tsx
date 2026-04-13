import { useEffect, useState } from 'react'
import { Link, useMatch, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { formatDkk } from '@/lib/format'
import {
  lineAmounts,
  totalsFromLines,
  type DraftLine,
} from '@/lib/invoiceMath'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

const emptyLine = (): DraftLine => ({
  description: '',
  quantity: 1,
  unit_price_cents: 0,
  vat_rate: 25,
})

export function InvoiceEditorPage() {
  const { currentCompany, user } = useApp()
  const navigate = useNavigate()
  const params = useParams()
  const isNew = useMatch({ path: '/app/invoices/new', end: true }) !== null
  const invoiceId = isNew ? null : params.id ?? null

  const [loading, setLoading] = useState(!isNew)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [issueDate, setIssueDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<Invoice['status']>('draft')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!invoiceId || !currentCompany) {
      setLoading(false)
      return
    }
    let c = false
    ;(async () => {
      const { data: inv, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', currentCompany.id)
        .single()
      if (e1 || !inv) {
        if (!c) {
          setError('Faktura ikke fundet')
          setLoading(false)
        }
        return
      }
      const { data: li, error: e2 } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true })
      if (e2) {
        if (!c) setError(e2.message)
      }
      if (!c) {
        setCustomerName(inv.customer_name)
        setCustomerEmail(inv.customer_email ?? '')
        setIssueDate(inv.issue_date)
        setDueDate(inv.due_date)
        setNotes(inv.notes ?? '')
        setStatus(inv.status)
        setInvoiceNumber(inv.invoice_number)
        setLines(
          (li as LineRow[] | null)?.length
            ? (li as LineRow[]).map((r) => ({
                description: r.description,
                quantity: Number(r.quantity),
                unit_price_cents: r.unit_price_cents,
                vat_rate: Number(r.vat_rate),
              }))
            : [emptyLine()],
        )
        setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [invoiceId, currentCompany])

  const totals = totalsFromLines(lines.filter((l) => l.description.trim()))

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    )
  }

  async function persist(nextStatus?: Invoice['status']) {
    if (!currentCompany || !user) return
    setSaving(true)
    setError(null)
    const effectiveLines = lines.filter((l) => l.description.trim())
    if (effectiveLines.length === 0) {
      setError('Tilføj mindst én linje med beskrivelse')
      setSaving(false)
      return
    }
    const t = totalsFromLines(effectiveLines)
    const st = nextStatus ?? status

    try {
      if (isNew || !invoiceId) {
        const { data: num, error: nErr } = await supabase.rpc(
          'next_invoice_number',
          { p_company_id: currentCompany.id },
        )
        if (nErr || !num) throw new Error(nErr?.message ?? 'Kunne ikke allokere nummer')

        const { data: inv, error: iErr } = await supabase
          .from('invoices')
          .insert({
            company_id: currentCompany.id,
            invoice_number: num,
            customer_name: customerName,
            customer_email: customerEmail || null,
            issue_date: issueDate,
            due_date: dueDate,
            currency: 'DKK',
            status: st,
            net_cents: t.net_cents,
            vat_cents: t.vat_cents,
            gross_cents: t.gross_cents,
            notes: notes || null,
            sent_at: st === 'sent' ? new Date().toISOString() : null,
          })
          .select('id')
          .single()
        if (iErr || !inv) throw new Error(iErr?.message ?? 'Kunne ikke oprette')

        const rows = effectiveLines.map((l, idx) => {
          const a = lineAmounts(l)
          return {
            invoice_id: inv.id,
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: l.unit_price_cents,
            vat_rate: l.vat_rate,
            ...a,
            sort_order: idx,
          }
        })
        const { error: lErr } = await supabase.from('invoice_line_items').insert(rows)
        if (lErr) throw new Error(lErr.message)

        await logActivity(currentCompany.id, 'invoice_created', `Faktura ${num} oprettet`, {
          invoice_id: inv.id,
        })
        navigate(`/app/invoices/${inv.id}`, { replace: true })
      } else {
        const { error: uErr } = await supabase
          .from('invoices')
          .update({
            customer_name: customerName,
            customer_email: customerEmail || null,
            issue_date: issueDate,
            due_date: dueDate,
            status: st,
            net_cents: t.net_cents,
            vat_cents: t.vat_cents,
            gross_cents: t.gross_cents,
            notes: notes || null,
            sent_at:
              st === 'sent'
                ? new Date().toISOString()
                : undefined,
          })
          .eq('id', invoiceId)
          .eq('company_id', currentCompany.id)
        if (uErr) throw new Error(uErr.message)

        await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
        const rows = effectiveLines.map((l, idx) => {
          const a = lineAmounts(l)
          return {
            invoice_id: invoiceId,
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: l.unit_price_cents,
            vat_rate: l.vat_rate,
            ...a,
            sort_order: idx,
          }
        })
        const { error: lErr } = await supabase.from('invoice_line_items').insert(rows)
        if (lErr) throw new Error(lErr.message)

        if (nextStatus === 'sent') {
          await logActivity(
            currentCompany.id,
            'invoice_sent',
            `Faktura ${invoiceNumber} sendt`,
            { invoice_id: invoiceId },
          )
        }
      }
      setStatus(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl')
    } finally {
      setSaving(false)
    }
  }

  if (!currentCompany) {
    return (
      <p className="text-slate-600">
        Vælg virksomhed i menuen eller gennemfør{' '}
        <Link className="text-indigo-600" to="/onboarding">
          onboarding
        </Link>
        .
      </p>
    )
  }

  if (loading) {
    return <p className="text-slate-500">Indlæser faktura…</p>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isNew ? 'Ny faktura' : `Faktura ${invoiceNumber}`}
          </h1>
          <p className="text-sm text-slate-600">Moms ekskl. på linjer (standard 25 %)</p>
        </div>
        <Link
          to="/app/invoices"
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Tilbage
        </Link>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Kundenavn</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Kunde e-mail</label>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="til send…"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Dato</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Forfaldsdato</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-700">Noter</label>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Linjer</h2>
          <button
            type="button"
            className="text-sm font-medium text-indigo-600"
            onClick={() => setLines((p) => [...p, emptyLine()])}
          >
            + Linje
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {lines.map((line, i) => {
            const a = lineAmounts(line)
            return (
              <div
                key={i}
                className="grid gap-3 border-b border-slate-100 pb-4 md:grid-cols-12 md:items-end"
              >
                <div className="md:col-span-5">
                  <label className="text-xs text-slate-500">Beskrivelse</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Antal</label>
                  <input
                    type="number"
                    min={0.0001}
                    step="any"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(i, { quantity: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Pris (øre, ekskl.)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={line.unit_price_cents}
                    onChange={(e) =>
                      updateLine(i, {
                        unit_price_cents: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-slate-500">Moms %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={line.vat_rate}
                    onChange={(e) =>
                      updateLine(i, { vat_rate: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="md:col-span-2 text-right text-sm text-slate-600">
                  <div className="text-xs text-slate-500">Linje i alt</div>
                  <div className="font-medium text-slate-900">
                    {formatDkk(a.line_gross_cents)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-6 border-t border-slate-100 pt-4 text-sm">
          <div>
            <span className="text-slate-500">Netto </span>
            <span className="font-semibold">{formatDkk(totals.net_cents)}</span>
          </div>
          <div>
            <span className="text-slate-500">Moms </span>
            <span className="font-semibold">{formatDkk(totals.vat_cents)}</span>
          </div>
          <div>
            <span className="text-slate-500">Brutto </span>
            <span className="font-semibold text-lg text-slate-900">
              {formatDkk(totals.gross_cents)}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          onClick={() => void persist('draft')}
        >
          Gem kladde
        </button>
        {!isNew ? (
          <>
            <button
              type="button"
              disabled={saving || status === 'cancelled'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              onClick={() => void persist('sent')}
            >
              Marker sendt
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void persist('paid')}
            >
              Marker betalt
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
              onClick={() => void persist('cancelled')}
            >
              Annuller
            </button>
            {customerEmail ? (
              <a
                className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
                href={`mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(`Faktura ${invoiceNumber}`)}`}
              >
                Åbn e-mail til kunde
              </a>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob } from '@/lib/invoicePdf'
import { buildZip, safeZipName, type ZipBytes, type ZipEntry } from '@/lib/zip'
import { formatDkk } from '@/lib/format'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']
type Voucher = Database['public']['Tables']['vouchers']['Row']

type Progress = { done: number; total: number; label: string } | null

/** Filendelse fra originalfilnavn/mime, så bilaget kan åbnes efter udpakning. */
function extensionFor(filename: string, mimeType: string | null): string {
  const fromName = filename.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]
  if (fromName) return fromName.toLowerCase()
  if (mimeType?.includes('pdf')) return 'pdf'
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('heic')) return 'heic'
  if (mimeType?.startsWith('image/')) return 'jpg'
  return 'bin'
}

function csvBlobBytes(rows: string[][]): ZipBytes {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const text = '﻿' + rows.map((r) => r.map(escape).join(';')).join('\r\n')
  // Kopieres, så typen bliver Uint8Array<ArrayBuffer> som ZIP-writeren kræver.
  return new Uint8Array(new TextEncoder().encode(text))
}

/** Kør `worker` over listen med et lille parallelitetsloft — hurtigere end sekventielt uden at drukne netværket. */
async function mapWithPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

export function SettingsExportPage() {
  const { currentCompany } = useApp()
  const [includeVouchers, setIncludeVouchers] = useState(true)
  const [includeInvoices, setIncludeInvoices] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [counts, setCounts] = useState<{ vouchers: number; invoices: number } | null>(null)
  const [progress, setProgress] = useState<Progress>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const busy = progress !== null

  useEffect(() => {
    if (!currentCompany) return
    let cancelled = false
    void (async () => {
      const [v, i] = await Promise.all([
        supabase
          .from('vouchers')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id),
      ])
      if (cancelled) return
      setCounts({ vouchers: v.count ?? 0, invoices: i.count ?? 0 })
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompany])

  const runExport = useCallback(async () => {
    if (!currentCompany) return
    setError(null)
    setMessage(null)
    setProgress({ done: 0, total: 0, label: 'Henter oversigt…' })

    try {
      const entries: ZipEntry[] = []
      const skipped: string[] = []

      // ── Bilag ────────────────────────────────────────────────────────────
      let vouchers: Voucher[] = []
      if (includeVouchers) {
        let q = supabase
          .from('vouchers')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('expense_date', { ascending: true })
        if (fromDate) q = q.gte('expense_date', fromDate)
        if (toDate) q = q.lte('expense_date', toDate)
        const { data, error: err } = await q
        if (err) throw new Error(err.message)
        vouchers = (data ?? []) as Voucher[]
      }

      // ── Fakturaer ────────────────────────────────────────────────────────
      let invoices: Invoice[] = []
      let linesByInvoice = new Map<string, LineRow[]>()
      if (includeInvoices) {
        let q = supabase
          .from('invoices')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('issue_date', { ascending: true })
        if (fromDate) q = q.gte('issue_date', fromDate)
        if (toDate) q = q.lte('issue_date', toDate)
        const { data, error: err } = await q
        if (err) throw new Error(err.message)
        invoices = (data ?? []) as Invoice[]

        linesByInvoice = new Map()
        // Hent linjer i klumper — ellers bliver `in`-filteret for langt ved mange fakturaer.
        for (let i = 0; i < invoices.length; i += 200) {
          const ids = invoices.slice(i, i + 200).map((inv) => inv.id)
          const { data: rows } = await supabase
            .from('invoice_line_items')
            .select('*')
            .in('invoice_id', ids)
            .order('sort_order', { ascending: true })
          for (const row of (rows ?? []) as LineRow[]) {
            const list = linesByInvoice.get(row.invoice_id) ?? []
            list.push(row)
            linesByInvoice.set(row.invoice_id, list)
          }
        }
      }

      const total = vouchers.length + invoices.length
      if (total === 0) {
        setProgress(null)
        setError('Der er ingen bilag eller fakturaer i den valgte periode.')
        return
      }

      let done = 0
      const tick = (label: string) => {
        done++
        setProgress({ done, total, label })
      }
      setProgress({ done: 0, total, label: 'Henter filer…' })

      // Bilagsfiler hentes fra storage som de er uploadet.
      await mapWithPool(vouchers, 4, async (v) => {
        const { data, error: err } = await supabase.storage.from('vouchers').download(v.storage_path)
        if (err || !data) {
          skipped.push(`Bilag ${v.voucher_number}: ${err?.message ?? 'filen kunne ikke hentes'}`)
        } else {
          const ext = extensionFor(v.filename, v.mime_type)
          const title = v.title?.trim() ? `_${safeZipName(v.title.trim())}` : ''
          entries.push({
            name: `bilag/${v.expense_date}_bilag-${v.voucher_number}${title}.${ext}`,
            data: new Uint8Array(await data.arrayBuffer()),
          })
        }
        tick('Henter bilag…')
      })

      // Fakturaer: importerede har en original-PDF i arkivet, resten genereres.
      const logo = includeInvoices ? await fetchCompanyLogoDataUrl(currentCompany.invoice_logo_path) : null
      for (const inv of invoices) {
        const number = safeZipName(String(inv.invoice_number ?? inv.id).trim() || inv.id)
        const isCreditNote = Boolean(inv.credited_invoice_id)
        const prefix = isCreditNote ? 'kreditnota' : 'faktura'
        try {
          if (inv.attachment_path) {
            const { data, error: err } = await supabase.storage
              .from('invoice-archive')
              .download(inv.attachment_path)
            if (err || !data) throw new Error(err?.message ?? 'filen kunne ikke hentes')
            entries.push({
              name: `fakturaer/${inv.issue_date}_${prefix}-${number}.pdf`,
              data: new Uint8Array(await data.arrayBuffer()),
            })
          } else {
            const creditRef = isCreditNote
              ? invoices.find((c) => c.id === inv.credited_invoice_id)?.invoice_number ?? null
              : null
            const blob = generateInvoicePdfBlob(
              currentCompany,
              inv,
              linesByInvoice.get(inv.id) ?? [],
              logo,
              isCreditNote
                ? {
                    heading: 'Kreditnota',
                    creditReferenceLine: creditRef
                      ? `Krediterer faktura ${creditRef}`
                      : 'Kreditnota',
                  }
                : undefined,
            )
            entries.push({
              name: `fakturaer/${inv.issue_date}_${prefix}-${number}.pdf`,
              data: new Uint8Array(await blob.arrayBuffer()),
            })
          }
        } catch (e) {
          skipped.push(`Faktura ${number}: ${e instanceof Error ? e.message : 'ukendt fejl'}`)
        }
        tick('Bygger faktura-PDF’er…')
      }

      // Oversigts-CSV'er, så revisor kan afstemme uden at åbne hver fil.
      if (vouchers.length > 0) {
        entries.push({
          name: 'bilag/oversigt-bilag.csv',
          data: csvBlobBytes([
            ['Bilagsnr.', 'Dato', 'Titel', 'Kategori', 'Brutto', 'Moms', 'Netto', 'Filnavn'],
            ...vouchers.map((v) => [
              String(v.voucher_number),
              v.expense_date,
              v.title ?? '',
              v.category ?? '',
              formatDkk(v.gross_cents),
              formatDkk(v.vat_cents),
              formatDkk(v.net_cents),
              v.filename,
            ]),
          ]),
        })
      }
      if (invoices.length > 0) {
        entries.push({
          name: 'fakturaer/oversigt-fakturaer.csv',
          data: csvBlobBytes([
            ['Fakturanr.', 'Dato', 'Forfald', 'Kunde', 'Status', 'Netto', 'Moms', 'Brutto'],
            ...invoices.map((inv) => [
              String(inv.invoice_number ?? ''),
              inv.issue_date,
              inv.due_date,
              inv.customer_name,
              inv.status,
              formatDkk(inv.net_cents, inv.currency),
              formatDkk(inv.vat_cents, inv.currency),
              formatDkk(inv.gross_cents, inv.currency),
            ]),
          ]),
        })
      }

      setProgress({ done: total, total, label: 'Pakker ZIP…' })
      const zip = buildZip(entries)
      const period = fromDate || toDate ? `_${fromDate || 'start'}-${toDate || 'i-dag'}` : ''
      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeZipName(currentCompany.name)}_regnskabsmateriale${period}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      setMessage(
        skipped.length === 0
          ? `Downloadede ${entries.length} filer.`
          : `Downloadede ${entries.length} filer. ${skipped.length} kunne ikke hentes: ${skipped
              .slice(0, 3)
              .join(', ')}${skipped.length > 3 ? ' …' : ''}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eksporten fejlede.')
    } finally {
      setProgress(null)
    }
  }, [currentCompany, includeVouchers, includeInvoices, fromDate, toDate])

  if (!currentCompany) return null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Download regnskabsmateriale</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Henter alle bilagsfiler og faktura-PDF’er som én ZIP-fil sammen med en CSV-oversigt.
          Filerne hentes i din browser, så det kan tage et øjeblik ved mange bilag.
        </p>

        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={includeVouchers}
              onChange={(e) => setIncludeVouchers(e.target.checked)}
              disabled={busy}
            />
            <span>
              Bilag
              {counts ? <span className="text-slate-500"> ({counts.vouchers} i alt)</span> : null}
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={includeInvoices}
              onChange={(e) => setIncludeInvoices(e.target.checked)}
              disabled={busy}
            />
            <span>
              Fakturaer og kreditnotaer
              {counts ? <span className="text-slate-500"> ({counts.invoices} i alt)</span> : null}
            </span>
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Fra dato (valgfri)</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Til dato (valgfri)</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
        ) : null}

        {progress ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>{progress.label}</span>
              <span>
                {progress.done}
                {progress.total > 0 ? ` / ${progress.total}` : ''}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{
                  width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '10%',
                }}
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void runExport()}
          disabled={busy || (!includeVouchers && !includeInvoices)}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Henter…' : 'Download ZIP'}
        </button>
      </div>
    </div>
  )
}

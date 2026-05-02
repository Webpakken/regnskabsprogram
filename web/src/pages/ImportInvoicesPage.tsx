import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { useApp } from '@/context/AppProvider'
import { supabase } from '@/lib/supabase'
import { extractInvoiceFromPdf } from '@/lib/invoicePdfExtract'
import type { Database } from '@/types/database'

type Row = {
  id: string
  file: File
  documentType: 'invoice' | 'credit_note'
  invoiceNumber: string
  /** Kun for kreditnotaer: nummeret på fakturaen der krediteres. */
  creditedInvoiceNumber: string
  issueDate: string
  dueDate: string
  customerName: string
  grossKr: string
  vatKr: string
  status: 'paid' | 'cancelled' | 'sent'
  confidence: 'high' | 'medium' | 'low'
  warning: string | null
  imported: boolean
  error: string | null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function centsToKr(cents: number | null): string {
  if (!cents) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

function parseKrToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return 0
  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function ImportInvoicesPage() {
  const { currentCompany, currentRole } = useApp()
  const navigate = useNavigate()
  const canImport = currentRole === 'owner' || currentRole === 'manager'

  const [rows, setRows] = useState<Row[]>([])
  const [extracting, setExtracting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [postImport, setPostImport] = useState<{ inserted: number; highest: number | null } | null>(
    null,
  )
  const [updatingNext, setUpdatingNext] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Forhindr browseren i at åbne PDF'en hvis brugeren rammer ved siden af drop-zonen.
  useEffect(() => {
    function blockDefault(e: DragEvent) {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
      }
    }
    window.addEventListener('dragover', blockDefault)
    window.addEventListener('drop', blockDefault)
    return () => {
      window.removeEventListener('dragover', blockDefault)
      window.removeEventListener('drop', blockDefault)
    }
  }, [])

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setPageError(null)
    setExtracting(true)
    const incoming = Array.from(fileList).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    const newRows: Row[] = []
    for (const f of incoming) {
      try {
        const ex = await extractInvoiceFromPdf(f)
        const issueDate = ex.issueDate ?? todayIso()
        // Default forfald = udsteldelsesdato + 14 dage hvis ikke fundet
        let dueDate = ex.dueDate
        if (!dueDate) {
          const [y, m, d] = issueDate.split('-').map(Number)
          const due = new Date(Date.UTC(y, m - 1, d))
          due.setUTCDate(due.getUTCDate() + 14)
          dueDate = due.toISOString().slice(0, 10)
        }
        newRows.push({
          id: crypto.randomUUID(),
          file: f,
          documentType: ex.documentType,
          invoiceNumber: ex.invoiceNumber ?? '',
          creditedInvoiceNumber: ex.creditedInvoiceNumber ?? '',
          issueDate,
          dueDate,
          customerName: ex.customerName ?? '',
          grossKr: centsToKr(ex.grossCents),
          vatKr: centsToKr(ex.vatCents),
          status: 'paid',
          confidence: ex.confidence,
          warning: null,
          imported: false,
          error: null,
        })
      } catch (e) {
        newRows.push({
          id: crypto.randomUUID(),
          file: f,
          documentType: 'invoice',
          invoiceNumber: '',
          creditedInvoiceNumber: '',
          issueDate: todayIso(),
          dueDate: todayIso(),
          customerName: '',
          grossKr: '',
          vatKr: '',
          status: 'paid',
          confidence: 'low',
          warning: e instanceof Error ? e.message : 'Kunne ikke læse PDF',
          imported: false,
          error: null,
        })
      }
    }
    // Lav-konfidens øverst så brugeren ser problematiske først.
    newRows.sort((a, b) => {
      const order = { low: 0, medium: 1, high: 2 }
      return order[a.confidence] - order[b.confidence]
    })
    setRows((prev) => [...prev, ...newRows])
    setExtracting(false)
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function importAll() {
    if (!currentCompany || !canImport) return
    setPageError(null)
    setImporting(true)
    const toImport = rows.filter((r) => !r.imported)
    // To-pass: fakturaer først (så krediterede fakturaer er tilstede når kreditnotaer
    // efterfølgende skal slå credited_invoice_id op).
    const sorted = [...toImport].sort((a, b) => {
      if (a.documentType === b.documentType) return 0
      return a.documentType === 'invoice' ? -1 : 1
    })
    let inserted = 0
    let highestInvoice: number | null = null

    for (const r of sorted) {
      if (!r.invoiceNumber.trim()) {
        updateRow(r.id, { error: r.documentType === 'credit_note' ? 'Kreditnotanr. mangler' : 'Fakturanummer mangler' })
        continue
      }
      const grossPositiveCents = parseKrToCents(r.grossKr)
      if (grossPositiveCents === null || grossPositiveCents <= 0) {
        updateRow(r.id, { error: 'Beløb mangler eller er ugyldigt' })
        continue
      }
      const vatPositiveCents = parseKrToCents(r.vatKr) ?? 0
      const netPositiveCents = Math.max(0, grossPositiveCents - vatPositiveCents)
      // Kreditnotaer registreres med negative beløb i Bilago (samme som "kreditAbs"-logik
      // andre steder i appen). Det giver korrekt total i dashboard og moms-rapport.
      const sign = r.documentType === 'credit_note' ? -1 : 1
      const grossCents = sign * grossPositiveCents
      const vatCents = sign * vatPositiveCents
      const netCents = sign * netPositiveCents

      // Slå krediteret faktura op hvis det er en kreditnota
      let creditedInvoiceId: string | null = null
      if (r.documentType === 'credit_note') {
        if (!r.creditedInvoiceNumber.trim()) {
          updateRow(r.id, {
            error: 'Krediteret fakturanummer mangler — udfyld feltet "Krediterer faktura"',
          })
          continue
        }
        const { data: refInv } = await supabase
          .from('invoices')
          .select('id')
          .eq('company_id', currentCompany.id)
          .eq('invoice_number', r.creditedInvoiceNumber.trim())
          .limit(1)
          .maybeSingle()
        if (!refInv) {
          updateRow(r.id, {
            error: `Faktura ${r.creditedInvoiceNumber} findes ikke endnu — importér den først`,
          })
          continue
        }
        creditedInvoiceId = refInv.id
      }

      // Tjek nummer-kollision
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('invoice_number', r.invoiceNumber.trim())
        .limit(1)
        .maybeSingle()
      if (existing) {
        updateRow(r.id, {
          error: `${r.documentType === 'credit_note' ? 'Kreditnotanr.' : 'Fakturanummer'} ${r.invoiceNumber} findes allerede`,
        })
        continue
      }

      // Upload PDF til invoice-archive bucket
      const safeName = r.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${currentCompany.id}/${crypto.randomUUID()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from('invoice-archive')
        .upload(path, r.file, { upsert: false, contentType: 'application/pdf' })
      if (upErr) {
        updateRow(r.id, { error: `Upload fejlede: ${upErr.message}` })
        continue
      }

      // Insert faktura/kreditnota
      const insert: Database['public']['Tables']['invoices']['Insert'] = {
        company_id: currentCompany.id,
        invoice_number: r.invoiceNumber.trim(),
        customer_name: r.customerName.trim() || 'Ukendt kunde',
        issue_date: r.issueDate,
        due_date: r.dueDate,
        status: r.status,
        net_cents: netCents,
        vat_cents: vatCents,
        gross_cents: grossCents,
        is_historical: true,
        attachment_path: path,
        credited_invoice_id: creditedInvoiceId,
      }
      const { error: dbErr } = await supabase.from('invoices').insert(insert)
      if (dbErr) {
        // Ryd op i storage så vi ikke har orphan-PDF
        await supabase.storage.from('invoice-archive').remove([path])
        updateRow(r.id, { error: `Database-fejl: ${dbErr.message}` })
        continue
      }

      updateRow(r.id, { imported: true, error: null })
      inserted += 1
      // Kun "almindelige" fakturaer tæller med i højeste-nummer-beregningen — ikke
      // kreditnotaer (de bruger typisk en separat sekvens eller flettes ind i samme
      // sekvens på det gamle system, men næste nye Bilago-faktura skal ikke kollidere).
      if (r.documentType === 'invoice') {
        const numericPart = parseInt(r.invoiceNumber.trim().replace(/\D/g, ''), 10)
        if (!Number.isNaN(numericPart) && (highestInvoice === null || numericPart > highestInvoice)) {
          highestInvoice = numericPart
        }
      }
    }

    setImporting(false)
    if (inserted > 0) {
      setPostImport({ inserted, highest: highestInvoice })
    } else {
      setPageError('Ingen fakturaer kunne importeres — tjek fejl i tabellen.')
    }
  }

  async function applyNextNumber(next: number) {
    if (!currentCompany) return
    setUpdatingNext(true)
    const { error } = await supabase
      .from('companies')
      .update({ invoice_starting_number: next })
      .eq('id', currentCompany.id)
    setUpdatingNext(false)
    if (error) {
      setPageError(error.message)
      return
    }
    navigate('/app/invoices')
  }

  if (!currentCompany) {
    return (
      <AppPageLayout maxWidth="full">
        <p className="text-slate-600">Vælg virksomhed.</p>
      </AppPageLayout>
    )
  }

  if (!canImport) {
    return (
      <AppPageLayout maxWidth="full" className="space-y-4">
        <Link to="/app/invoices" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Tilbage
        </Link>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Du skal være ejer eller manager for at importere fakturaer.
        </p>
      </AppPageLayout>
    )
  }

  return (
    <AppPageLayout maxWidth="full" className="space-y-4">
      <Link to="/app/invoices" className="text-sm font-medium text-indigo-600 hover:underline">
        ← Tilbage til fakturaer
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Importér historiske fakturaer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Træk PDF-fakturaer fra dit gamle regnskabssystem ind. Vi læser dem automatisk, du tjekker
          felterne, og vi gemmer både PDF og data så de tæller med i dashboard, moms og rapporter.
        </p>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center hover:border-indigo-400 hover:bg-indigo-50/40"
      >
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <span className="text-sm font-semibold text-slate-900">
          {extracting ? 'Læser PDF’er…' : 'Klik eller træk PDF’er ind her'}
        </span>
        <span className="text-xs text-slate-500">Du kan vælge flere på én gang</span>
      </label>

      {pageError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {pageError}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900">{rows.length} faktura(er) klar</span>
            <button
              type="button"
              disabled={importing || rows.every((r) => r.imported)}
              onClick={() => void importAll()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {importing ? 'Importerer…' : 'Importér alle'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fil</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Nummer</th>
                  <th className="px-3 py-2">Krediterer</th>
                  <th className="px-3 py-2">Dato</th>
                  <th className="px-3 py-2">Forfald</th>
                  <th className="px-3 py-2">Kunde</th>
                  <th className="px-3 py-2 text-right">Beløb (kr)</th>
                  <th className="px-3 py-2 text-right">Moms (kr)</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const ringClass =
                    r.error
                      ? 'ring-2 ring-rose-200'
                      : r.imported
                        ? 'opacity-70'
                        : r.confidence === 'low'
                          ? 'ring-1 ring-amber-200'
                          : ''
                  return (
                    <tr key={r.id} className={`align-top ${ringClass}`}>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        <span className="block max-w-[200px] truncate" title={r.file.name}>
                          {r.file.name}
                        </span>
                        {r.imported ? (
                          <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Importeret
                          </span>
                        ) : r.confidence === 'low' ? (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Tjek felter
                          </span>
                        ) : null}
                        {r.error ? <span className="mt-1 block text-xs text-rose-700">{r.error}</span> : null}
                        {r.warning ? (
                          <span className="mt-1 block text-xs text-amber-700">{r.warning}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.documentType}
                          disabled={r.imported}
                          onChange={(e) =>
                            updateRow(r.id, {
                              documentType: e.target.value as Row['documentType'],
                            })
                          }
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="invoice">Faktura</option>
                          <option value="credit_note">Kreditnota</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={r.invoiceNumber}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { invoiceNumber: e.target.value })}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {r.documentType === 'credit_note' ? (
                          <input
                            type="text"
                            value={r.creditedInvoiceNumber}
                            disabled={r.imported}
                            onChange={(e) =>
                              updateRow(r.id, { creditedInvoiceNumber: e.target.value })
                            }
                            placeholder="Faktura-nr."
                            className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.issueDate}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { issueDate: e.target.value })}
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.dueDate}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { dueDate: e.target.value })}
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={r.customerName}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { customerName: e.target.value })}
                          className="w-40 rounded border border-slate-200 px-2 py-1 text-sm"
                          placeholder="Ukendt kunde"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={r.grossKr}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { grossKr: e.target.value })}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={r.vatKr}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { vatKr: e.target.value })}
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.status}
                          disabled={r.imported}
                          onChange={(e) => updateRow(r.id, { status: e.target.value as Row['status'] })}
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="paid">Betalt</option>
                          <option value="sent">Sendt</option>
                          <option value="cancelled">Annulleret</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!r.imported ? (
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            className="text-xs font-medium text-rose-600 hover:underline"
                          >
                            Fjern
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {postImport ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Import fuldført</h2>
            <p className="mt-2 text-sm text-slate-700">
              {postImport.inserted} faktura(er) er importeret og gemt med PDF.
            </p>
            {postImport.highest !== null ? (
              <>
                <p className="mt-3 text-sm text-slate-700">
                  Højeste fakturanummer var{' '}
                  <span className="font-semibold text-slate-900">{postImport.highest}</span>. Vil du
                  starte næste nye faktura på{' '}
                  <span className="font-semibold text-slate-900">{postImport.highest + 1}</span>?
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/app/invoices')}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Nej, jeg vælger selv senere
                  </button>
                  <button
                    type="button"
                    disabled={updatingNext}
                    onClick={() => void applyNextNumber((postImport.highest ?? 0) + 1)}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {updatingNext ? 'Opdaterer…' : `Ja, sæt næste nummer til ${postImport.highest + 1}`}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => navigate('/app/invoices')}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  OK
                </button>
              </div>
            )}
            {postImport.highest !== null ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Bemærk: Hvis nogle af de importerede numre er alfanumeriske (fx "2026-A-001"),
                tæller vi kun den numeriske del — du kan altid ændre næste nummer i Indstillinger →
                Faktura.
              </p>
            ) : (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Vi kunne ikke finde et numerisk fakturanummer at fortsætte fra. Sæt det manuelt i
                Indstillinger → Faktura.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </AppPageLayout>
  )
}

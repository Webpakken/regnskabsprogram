import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DesktopListCardsToggle } from '@/components/DesktopListCardsToggle'
import { useDesktopListViewPreference } from '@/hooks/useDesktopListViewPreference'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { formatDateOnly, formatDkk } from '@/lib/format'
import { formatParsedNotes, parseDanishReceiptText } from '@/lib/receiptParse'
import { canAttemptVoucherOcr, ocrImageOrPdfFile } from '@/lib/voucherOcr'
import type { Database } from '@/types/database'

type Voucher = Database['public']['Tables']['vouchers']['Row']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const VOUCHERS_VIEW_KEY = 'bilago:vouchersDesktopView'

export function VouchersPage() {
  const { currentCompany, user } = useApp()
  const [desktopView, setDesktopView] = useDesktopListViewPreference(VOUCHERS_VIEW_KEY, 'list')
  const [rows, setRows] = useState<Voucher[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrWarning, setOcrWarning] = useState<string | null>(null)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const overlayDragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!currentCompany) return
    const { data } = await supabase
      .from('vouchers')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('uploaded_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [currentCompany])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    const tokens = q.split(/\s+/).filter(Boolean)
    return rows.filter((v) => {
      const dateStr = v.expense_date
        ? formatDateOnly(v.expense_date)
        : formatDateOnly(v.uploaded_at)
      const grossStr = v.gross_cents ? formatDkk(v.gross_cents) : ''
      const vatStr = v.vat_cents ? formatDkk(v.vat_cents) : ''
      const hay = [
        v.title ?? '',
        v.filename ?? '',
        v.category ?? '',
        v.notes ?? '',
        dateStr,
        grossStr,
        vatStr,
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every((t) => hay.includes(t))
    })
  }, [rows, searchQuery])

  async function uploadVoucherFile(file: File) {
    if (!currentCompany || !user) return
    setUploading(true)
    setError(null)
    setOcrWarning(null)
    setOcrProgress(null)

    const canOcr = canAttemptVoucherOcr(file)

    let titleForDb = file.name.replace(/\.[^.]+$/, '')
    let expenseDateForDb = todayIso()
    let grossKrForDb = ''
    let vatRateForDb = '25'
    let notesForDb: string | null = null

    if (canOcr) {
      try {
        const text = await ocrImageOrPdfFile(file, (p) => setOcrProgress(p))
        const parsed = parseDanishReceiptText(text)
        notesForDb = formatParsedNotes(parsed)
        titleForDb = parsed.merchantGuess ?? titleForDb
        if (parsed.expenseDateIso) {
          expenseDateForDb = parsed.expenseDateIso
        }
        if (parsed.totalKr != null) {
          grossKrForDb = parsed.totalKr.toFixed(2).replace('.', ',')
        }
        if (parsed.vatRateGuess !== null) {
          vatRateForDb = String(parsed.vatRateGuess)
        }
      } catch (e) {
        console.warn('[bilag OCR]', e)
        setOcrWarning(
          'Kunne ikke læse bilaget automatisk — det er uploadet; du kan tjekke beløb i listen eller bruge «Scan bilag» til kamera. HEIC: eksporter som JPEG hvis nødvendigt.',
        )
      }
    }

    setOcrProgress(null)

    const grossCents = Math.round(
      (parseFloat(grossKrForDb.replace(',', '.')) || 0) * 100,
    )
    const rate = parseFloat(vatRateForDb.replace(',', '.')) || 0
    const netCents = rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents
    const vatCents = grossCents - netCents

    const path = `${currentCompany.id}/${crypto.randomUUID()}-${file.name}`
    const { error: upErr } = await supabase.storage
      .from('vouchers')
      .upload(path, file, { upsert: false })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const { error: dbErr } = await supabase.from('vouchers').insert({
      company_id: currentCompany.id,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      title: titleForDb,
      category: null,
      notes: notesForDb,
      uploaded_by: user.id,
      expense_date: expenseDateForDb,
      gross_cents: grossCents,
      net_cents: netCents,
      vat_cents: vatCents,
      vat_rate: rate,
    })
    if (dbErr) {
      setError(dbErr.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    await logActivity(currentCompany.id, 'voucher_upload', `Bilag uploadet: ${file.name}`)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
    await load()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadVoucherFile(file)
  }

  function onPageDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (uploading) return
    if (!e.dataTransfer.types.includes('Files')) return
    setDragActive(true)
  }

  function onPageDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onOverlayDragEnter(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current += 1
  }

  function onOverlayDragLeave(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current -= 1
    if (overlayDragDepthRef.current <= 0) {
      overlayDragDepthRef.current = 0
      setDragActive(false)
    }
  }

  function onOverlayDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onOverlayDrop(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current = 0
    setDragActive(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadVoucherFile(file)
  }

  /**
   * Åbner fil i ny fane. Brug ikke «about:blank» + sæt location efter `await` — flere
   * browsere blokerer så navigation (tab forbliver tom).
   */
  async function openSigned(v: Voucher) {
    setError(null)
    let url: string
    try {
      const { data, error: err } = await supabase.storage
        .from('vouchers')
        .createSignedUrl(v.storage_path, 3600)
      if (err || !data?.signedUrl) {
        setError(err?.message ?? 'Kunne ikke åbne fil')
        return
      }
      url = data.signedUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke åbne fil')
      return
    }
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (w) return
    // Pop op blokeret: åbn i samme fane så brugeren ikke får en tom fane
    window.location.assign(url)
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Vælg virksomhed.</p>
  }

  return (
    <div
      className="relative min-h-[60vh] space-y-6"
      onDragEnter={onPageDragEnter}
      onDragOver={onPageDragOver}
    >
      {dragActive ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-indigo-600/20 backdrop-blur-[2px]"
          onDragEnter={onOverlayDragEnter}
          onDragLeave={onOverlayDragLeave}
          onDragOver={onOverlayDragOver}
          onDrop={onOverlayDrop}
          aria-live="polite"
          role="presentation"
        >
          <div className="pointer-events-none mx-4 max-w-lg rounded-2xl border-4 border-dashed border-indigo-500 bg-white/95 px-8 py-10 text-center shadow-2xl">
            <p className="text-lg font-semibold text-indigo-900">Slip filen her</p>
            <p className="mt-2 text-sm text-slate-600">
              Filen uploades; beløb og dato gættes automatisk når det er muligt.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bilag</h1>
          <p className="text-sm text-slate-600">
            Scan med kamera, upload en fil, eller træk filer ind et vilkårligt sted på siden. Kun
            denne virksomhed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          <Link
            to="/app/vouchers/scan"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Scan bilag
          </Link>
          <label
            className={
              'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 ' +
              (uploading ? 'pointer-events-none opacity-60' : '')
            }
          >
            {uploading
              ? ocrProgress != null
                ? `Læser… ${ocrProgress}%`
                : 'Uploader…'
              : 'Upload bilag'}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onFile(e)}
            />
          </label>
        </div>
      </div>

      {ocrWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ocrWarning}
        </p>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-2">
        <h2 className="text-base font-semibold text-slate-900">Dine bilag</h2>
        <DesktopListCardsToggle mode={desktopView} onChange={setDesktopView} />
      </div>

      <label className="block">
        <span className="sr-only">Søg i bilag</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Søg efter titel, fil, kategori, beløb, dato …"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          autoComplete="off"
        />
      </label>

      <div
        className={`grid grid-cols-1 gap-3 ${desktopView === 'list' ? 'md:hidden' : 'md:grid-cols-2 lg:grid-cols-3'}`}
      >
        {loading ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Indlæser…
          </p>
        ) : rows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Ingen bilag endnu.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Ingen bilag matcher søgningen.
          </p>
        ) : (
          filteredRows.map((v) => {
            const dateStr = v.expense_date
              ? formatDateOnly(v.expense_date)
              : formatDateOnly(v.uploaded_at)
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => openSigned(v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openSigned(v)
                  }
                }}
                className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {dateStr}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {v.gross_cents ? formatDkk(v.gross_cents) : '—'}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{v.title ?? '—'}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <span>{v.category ? `Kategori: ${v.category}` : '—'}</span>
                  <span>{v.vat_cents ? `Moms ${formatDkk(v.vat_cents)}` : 'Moms —'}</span>
                </div>
                <span className="text-sm font-medium text-indigo-600">Åbn bilag →</span>
              </div>
            )
          })
        )}
      </div>

      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${desktopView === 'list' ? 'hidden md:block' : 'hidden'}`}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3">Titel</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Beløb</th>
              <th className="px-4 py-3 text-right">Moms</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Ingen bilag endnu.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Ingen bilag matcher søgningen.
                </td>
              </tr>
            ) : (
              filteredRows.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">
                    {v.expense_date
                      ? formatDateOnly(v.expense_date)
                      : formatDateOnly(v.uploaded_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{v.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {v.gross_cents ? formatDkk(v.gross_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {v.vat_cents ? formatDkk(v.vat_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-indigo-600 hover:underline"
                      onClick={() => openSigned(v)}
                    >
                      Åbn
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

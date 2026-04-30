import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getExpenseUploadLinkInfo, submitExpenseUpload, type ExpenseUploadLinkInfo } from '@/lib/edge'
import { fileToBase64 } from '@/lib/expenseLinks'
import { formatParsedNotes, parseDanishReceiptText } from '@/lib/receiptParse'
import { canAttemptVoucherOcr, ocrImageOrPdfFile } from '@/lib/voucherOcr'
import { inferVoucherCategory } from '@/lib/voucherCategories'
import { BrandLogo } from '@/components/BrandLogo'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function centsFromKr(value: string) {
  return Math.round((parseFloat(value.replace(',', '.')) || 0) * 100)
}

export function ExpenseUploadPage() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<ExpenseUploadLinkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [reg, setReg] = useState('')
  const [account, setAccount] = useState('')
  const [title, setTitle] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayIso)
  const [grossKr, setGrossKr] = useState('')
  const [vatRate, setVatRate] = useState('25')
  const [category, setCategory] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getExpenseUploadLinkInfo(token)
        if (!cancelled) setInfo(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Linket kunne ikke indlæses.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const expiresLabel = useMemo(() => {
    if (!info) return ''
    return new Intl.DateTimeFormat('da-DK', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(info.expires_at))
  }, [info])

  async function onFileChange(nextFile: File | null) {
    setFile(nextFile)
    setError(null)
    if (!nextFile) return
    setTitle(nextFile.name.replace(/\.[^.]+$/, ''))
    if (!canAttemptVoucherOcr(nextFile)) return
    try {
      const text = await ocrImageOrPdfFile(nextFile, setOcrProgress)
      const parsed = parseDanishReceiptText(text)
      setNotes(formatParsedNotes(parsed))
      setTitle(parsed.merchantGuess ?? nextFile.name.replace(/\.[^.]+$/, ''))
      setCategory(
        inferVoucherCategory(
          [parsed.merchantGuess, parsed.rawSnippet, parsed.lineItems.join(' '), nextFile.name]
            .filter(Boolean)
            .join(' '),
        ),
      )
      if (parsed.expenseDateIso) setExpenseDate(parsed.expenseDateIso)
      if (parsed.totalKr != null) setGrossKr(parsed.totalKr.toFixed(2).replace('.', ','))
      if (parsed.vatRateGuess !== null) setVatRate(String(parsed.vatRateGuess))
    } catch {
      setNotes(null)
    } finally {
      setOcrProgress(null)
    }
  }

  async function submit() {
    if (!file) {
      setError('Vælg et bilag først.')
      return
    }
    if (!name.trim()) {
      setError('Skriv dit navn.')
      return
    }
    if (!reg.trim()) {
      setError('Skriv dit reg.nr.')
      return
    }
    if (!account.trim()) {
      setError('Skriv dit kontonr.')
      return
    }
    const grossCents = centsFromKr(grossKr)
    if (!grossCents || grossCents <= 0) {
      setError('Skriv beløbet (fx 125,00).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const rate = parseFloat(vatRate.replace(',', '.')) || 0
      const netCents = rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents
      const vatCents = grossCents - netCents
      await submitExpenseUpload({
        token,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileBase64: await fileToBase64(file),
        requesterName: name.trim(),
        phone: phone.trim() || undefined,
        bankRegNumber: reg.trim() || undefined,
        bankAccountNumber: account.trim() || undefined,
        title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
        category,
        notes,
        expenseDate,
        grossCents,
        netCents,
        vatCents,
        vatRate: rate,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilaget kunne ikke uploades.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="inline-flex">
          <BrandLogo />
        </Link>
        {info?.company_name ? (
          <p className="mt-3 text-sm font-medium text-slate-600">
            Udlægsupload til <span className="text-slate-900">{info.company_name}</span>
          </p>
        ) : null}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Upload udlæg</h1>
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Indlæser link…</p>
          ) : error && !info ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : done ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <p className="font-semibold">Tak, bilaget er uploadet.</p>
              <p className="mt-1 text-sm">Virksomheden kan nu godkende og refundere udlægget.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-600">
                Link til <span className="font-semibold text-slate-900">{info?.company_name}</span>.
                Udløber {expiresLabel}.
              </p>
              <p className="text-xs text-slate-500">
                Felter markeret med <span className="text-rose-600">*</span> er påkrævet.
              </p>
              <label className="block">
                <span className="text-sm font-medium">
                  Bilag <span className="text-rose-600">*</span>
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                {ocrProgress != null ? <span className="mt-1 block text-xs text-slate-500">Scanner… {ocrProgress}%</span> : null}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">
                    Dit navn <span className="text-rose-600">*</span>
                  </span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">Telefon</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">
                    Reg.nr. <span className="text-rose-600">*</span>
                  </span>
                  <input value={reg} onChange={(e) => setReg(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">
                    Kontonr. <span className="text-rose-600">*</span>
                  </span>
                  <input value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">Titel</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Dato</span>
                  <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">
                    Beløb <span className="text-rose-600">*</span>
                  </span>
                  <input value={grossKr} onChange={(e) => setGrossKr(e.target.value)} placeholder="125,00" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
              </div>
              {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
              >
                {submitting ? 'Uploader…' : 'Upload bilag'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

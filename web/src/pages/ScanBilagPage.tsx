import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { downscaleToCanvas, scoreDocumentPresence } from '@/lib/documentDetect'
import { formatParsedNotes, parseDanishReceiptText } from '@/lib/receiptParse'
import { renderPdfFirstPageToCanvas } from '@/lib/pdfToCanvas'
import { maxOcrDimension, ocrReceiptCanvas } from '@/lib/voucherOcr'

/** Lavere tærskel + færre frames — mobil-kamera giver ofte lavere «edge score». */
const DETECT_THRESHOLD = 0.075
const FRAMES_STABLE = 6

type Phase =
  | 'init'
  | 'no_camera'
  | 'stream'
  | 'processing'
  | 'review'
  | 'saving'

export function ScanBilagPage() {
    // Forhindrer dobbelt capture
    const autoCaptureRef = useRef(false)
  const navigate = useNavigate()
  const { currentCompany, user } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const stableRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('init')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [searching, setSearching] = useState(true)
  const [documentFound, setDocumentFound] = useState(false)
  // ...existing code...
    // Automatisk capture når dokument er fundet og stabilt
    useEffect(() => {
      if (
        phase === 'stream' &&
        documentFound &&
        !searching &&
        !autoCaptureRef.current
      ) {
        autoCaptureRef.current = true
        captureFromCamera().finally(() => {
          // Tillad ny auto-capture hvis man går tilbage til stream
          setTimeout(() => {
            autoCaptureRef.current = false
          }, 2000)
        })
      }
    }, [phase, documentFound, searching])
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [parsed, setParsed] = useState<ReturnType<typeof parseDanishReceiptText> | null>(
    null,
  )
  const [title, setTitle] = useState('')
  const [expenseDate, setExpenseDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [grossKr, setGrossKr] = useState('')
  const [vatRate, setVatRate] = useState('25')
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cameraKey, setCameraKey] = useState(0)

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [stopCamera, previewUrl])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play()
        }
        setPhase('stream')
        setCameraError(null)
      } catch {
        setCameraError(
          'Kunne ikke åbne kameraet. Tjek tilladelser (HTTPS påkrævet uden for localhost).',
        )
        setPhase('no_camera')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [cameraKey])

  /* Dokument-detektion på video */
  useEffect(() => {
    if (phase !== 'stream' || !videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const c2 = ctx

    function tick() {
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const small = downscaleToCanvas(video, 320, 240)
      canvas.width = small.width
      canvas.height = small.height
      c2.drawImage(small, 0, 0)
      const id = c2.getImageData(0, 0, small.width, small.height)
      const score = scoreDocumentPresence(id)
      if (score >= DETECT_THRESHOLD) {
        stableRef.current += 1
        if (stableRef.current >= FRAMES_STABLE) {
          setDocumentFound(true)
          setSearching(false)
        }
      } else {
        stableRef.current = 0
        setDocumentFound(false)
        setSearching(true)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  async function captureFromCamera() {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    setPhase('processing')
    setOcrProgress(0)
    setSaveError(null)

    const dim = maxOcrDimension()
    /* Safari: må ikke stoppe kameraet før billedet er kopieret til canvas — ellers
       «The object is in an invalid state» ved drawImage/toBlob. */
    let cap: HTMLCanvasElement
    try {
      cap = downscaleToCanvas(video, dim, dim)
    } catch (e) {
      console.warn('[scan capture]', e)
      setSaveError(
        'Kunne ikke fange billede fra kameraet. Prøv igen, eller vælg foto fra Kamerarulle.',
      )
      setPhase('stream')
      return
    }

    const blob = await new Promise<Blob | null>((res) =>
      cap.toBlob((b) => res(b), 'image/jpeg', 0.92),
    )
    if (blob) {
      const url = URL.createObjectURL(blob)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    }

    stopCamera()

    try {
      const text = await ocrReceiptCanvas(cap, (p) => setOcrProgress(p))
      setOcrText(text)
      const p = parseDanishReceiptText(text)
      setParsed(p)
      setTitle(p.merchantGuess ?? 'Kvittering')
      if (p.expenseDateIso) setExpenseDate(p.expenseDateIso)
      if (p.totalKr != null) setGrossKr(p.totalKr.toFixed(2).replace('.', ','))
      if (p.vatRateGuess !== null) setVatRate(String(p.vatRateGuess))
      setNotes('')
      setPhase('review')
    } catch (e) {
      console.warn('[scan OCR]', e)
      const raw = e instanceof Error ? e.message : String(e)
      const msg =
        raw.includes('invalid state') || raw.includes('InvalidStateError')
          ? 'Kameraet var ikke klar — prøv igen, eller vælg billedet fra Kamerarulle.'
          : raw
      setSaveError(
        msg ||
          'Kunne ikke læse kvitteringen. Prøv «Kamerarulle» eller et mindre billede.',
      )
      setPhase('stream')
      setCameraKey((k) => k + 1)
    }
  }

  async function handleGalleryFile(file: File | null) {
    if (!file) return
    setPhase('processing')
    setOcrProgress(0)
    setSaveError(null)
    try {
      let canvas: HTMLCanvasElement
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        canvas = await renderPdfFirstPageToCanvas(file, 2.5)
      } else {
        const img = new Image()
        const url = URL.createObjectURL(file)
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Billede kunne ikke læses'))
          img.src = url
        })
        canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas')
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
      }
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      )
      if (blob) {
        const u = URL.createObjectURL(blob)
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return u
        })
      }
      const text = await ocrReceiptCanvas(canvas, (p) => setOcrProgress(p))
      setOcrText(text)
      const p = parseDanishReceiptText(text)
      setParsed(p)
      setTitle(p.merchantGuess ?? file.name)
      if (p.expenseDateIso) setExpenseDate(p.expenseDateIso)
      if (p.totalKr != null) setGrossKr(p.totalKr.toFixed(2).replace('.', ','))
      if (p.vatRateGuess !== null) setVatRate(String(p.vatRateGuess))
      setNotes('')
      setPhase('review')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Kunne ikke læse fil')
      setPhase('stream')
    }
  }

  async function saveVoucher() {
    if (!currentCompany || !user || !previewUrl) return
    setPhase('saving')
    setSaveError(null)
    const res = await fetch(previewUrl)
    const blob = await res.blob()
    const grossCents = Math.round(
      (parseFloat(grossKr.replace(',', '.')) || 0) * 100,
    )
    const rate = parseFloat(vatRate.replace(',', '.')) || 0
    const netCents = rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents
    const vatCents = grossCents - netCents
    const fname = `scan-${Date.now()}.jpg`
    const path = `${currentCompany.id}/${crypto.randomUUID()}-${fname}`

    const { error: upErr } = await supabase.storage
      .from('vouchers')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (upErr) {
      setSaveError(upErr.message)
      setPhase('review')
      return
    }
    const { data: inserted, error: dbErr } = await supabase
      .from('vouchers')
      .insert({
        company_id: currentCompany.id,
        storage_path: path,
        filename: fname,
        mime_type: 'image/jpeg',
        title: title || fname,
        category: 'Scan',
        notes: notes || null,
        uploaded_by: user.id,
        expense_date: expenseDate,
        gross_cents: grossCents,
        net_cents: netCents,
        vat_cents: vatCents,
        vat_rate: rate,
      })
      .select('id')
      .single()
    if (dbErr) {
      setSaveError(dbErr.message)
      setPhase('review')
      return
    }
    await logActivity(currentCompany.id, 'voucher_scan', `Bilag scannet: ${title || fname}`, {
      voucher_id: inserted.id,
    })
    navigate(`/app/vouchers?voucher=${encodeURIComponent(inserted.id)}`)
  }

  if (!currentCompany) {
    return (
      <p className="p-4 text-slate-600">
        Vælg virksomhed.{' '}
        <button type="button" className="text-indigo-600" onClick={() => navigate(-1)}>
          Tilbage
        </button>
      </p>
    )
  }

  if (phase === 'review' || phase === 'saving') {
    return (
      <div className="relative -mx-4 min-h-[100dvh] bg-slate-50 pb-8 md:-mx-8">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            className="text-sm font-medium text-indigo-600"
            onClick={() => {
              if (previewUrl) URL.revokeObjectURL(previewUrl)
              setPreviewUrl(null)
              setParsed(null)
              setOcrText('')
              stableRef.current = 0
              setDocumentFound(false)
              setSearching(true)
              setPhase('init')
              setCameraKey((k) => k + 1)
            }}
          >
            Scan igen
          </button>
          <h1 className="text-base font-semibold text-slate-900">Gennemse bilag</h1>
          <span className="w-14" />
        </header>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="mx-auto max-h-48 w-full max-w-md object-contain"
          />
        ) : null}

        <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
          <label className="block text-sm font-medium text-slate-700">Titel</label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block text-sm font-medium text-slate-700">Bilagsdato</label>
          <input
            type="date"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
          <label className="block text-sm font-medium text-slate-700">
            Beløb inkl. moms (kr.)
          </label>
          <input
            inputMode="decimal"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={grossKr}
            onChange={(e) => setGrossKr(e.target.value)}
          />
          <label className="block text-sm font-medium text-slate-700">Momssats %</label>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
          >
            <option value="25">25 %</option>
            <option value="0">0 %</option>
          </select>
          <label className="block text-sm font-medium text-slate-700">
            Noter (OCR + varer)
          </label>
          <textarea
            className="min-h-[120px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {parsed?.lineItems.length ? (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-medium">Rå OCR (uddrag)</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-2">
                {ocrText.slice(0, 2000)}
              </pre>
            </details>
          ) : null}
          {saveError ? (
            <p className="text-sm text-red-600">{saveError}</p>
          ) : null}
          <button
            type="button"
            disabled={phase === 'saving'}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void saveVoucher()}
          >
            {phase === 'saving' ? 'Gemmer…' : 'Gem bilag'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-white">
        <p className="text-center text-lg font-medium">Læser kvittering…</p>
        <p className="mt-2 text-sm text-white/70">{ocrProgress}%</p>
        <p className="mt-3 max-w-xs text-center text-xs text-white/55">
          Første gang hentes sprogfiler — det kan tage 15–45 sek. på mobil. Fanen skal være åben.
        </p>
        <div className="mt-6 h-2 w-48 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full bg-indigo-400 transition-all"
            style={{ width: `${Math.max(ocrProgress, 2)}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-black md:relative md:inset-auto md:z-auto">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="text-sm font-medium text-blue-400"
          onClick={() => {
            stopCamera()
            navigate(-1)
          }}
        >
          Luk
        </button>
        <h1 className="text-base font-semibold text-white">Upload bilag</h1>
        <span className="w-10" aria-hidden />
      </header>

      {phase === 'no_camera' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
          <p>{cameraError}</p>
          <label className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold">
            Vælg billede eller PDF
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => void handleGalleryFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      ) : (
        <>
          <video
            key={cameraKey}
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-[100dvh] w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {searching && !documentFound ? (
              <div className="mx-6 rounded-2xl bg-black/60 px-6 py-8 text-center backdrop-blur-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white">Søger efter bilag</p>
                <p className="mt-2 text-xs text-white/75">
                  Eller tryk på den blå knap — automatisk scanning er valgfri.
                </p>
              </div>
            ) : null}
            {documentFound ? (
              <div className="mx-4 aspect-[3/4] w-full max-w-sm rounded-lg border-4 border-blue-500/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            ) : null}
          </div>

          {saveError ? (
            <div className="absolute inset-x-0 bottom-[5.5rem] z-30 mx-4 rounded-xl bg-red-900/90 px-3 py-2 text-center text-xs text-white">
              {saveError}
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-around border-t border-white/10 bg-black/50 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <label className="flex cursor-pointer flex-col items-center gap-1 text-blue-400">
              <span className="text-2xl">🖼</span>
              <span className="text-xs font-medium">Kamerarulle</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => void handleGalleryFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={() => void captureFromCamera()}
              className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/40 bg-blue-600 shadow-lg ring-4 ring-white/20"
              aria-label="Tag billede"
            />
            <button
              type="button"
              className="flex flex-col items-center gap-1 text-blue-400"
              onClick={() => {
                stopCamera()
                navigate('/app/vouchers')
              }}
            >
              <span className="text-2xl">📄</span>
              <span className="text-xs font-medium">Dokumenter</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

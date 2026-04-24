import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { loadInvoicePdfPreview } from '@/lib/loadInvoicePdfPreview'
import { InvoicePdfCanvasViewer } from '@/components/InvoicePdfCanvasViewer'
type OriginalPdfPreview = {
  url: string
  invoiceNumber: string
  invoiceId: string
}

export function InvoicePdfPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentCompany } = useApp()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [originalPdf, setOriginalPdf] = useState<OriginalPdfPreview | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState<string>('')
  const [isCreditNote, setIsCreditNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const objectUrlsRef = useRef<string[]>([])

  function revokeAllBlobUrls() {
    for (const u of objectUrlsRef.current) {
      URL.revokeObjectURL(u)
    }
    objectUrlsRef.current = []
  }

  useEffect(() => {
    if (!id || !currentCompany) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      revokeAllBlobUrls()
      setBlobUrl(null)
      setOriginalPdf(null)
      try {
        const r = await loadInvoicePdfPreview(currentCompany, id)
        if (cancelled) {
          URL.revokeObjectURL(r.mainObjectUrl)
          if (r.originalPdf) URL.revokeObjectURL(r.originalPdf.url)
          return
        }
        objectUrlsRef.current.push(r.mainObjectUrl)
        if (r.originalPdf) objectUrlsRef.current.push(r.originalPdf.url)
        setInvoiceNumber(r.invoiceNumber)
        setIsCreditNote(r.isCreditNote)
        setBlobUrl(r.mainObjectUrl)
        setOriginalPdf(r.originalPdf)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Kunne ikke vise PDF')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      revokeAllBlobUrls()
    }
  }, [id, currentCompany])

  function downloadUrl(url: string, fileLabel: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = fileLabel
    a.click()
  }

  function downloadCreditNote() {
    if (!blobUrl) return
    const key = (invoiceNumber || id || 'dokument').replace(/[^\w.-]+/g, '_')
    const label = isCreditNote ? `kreditnota-${key}.pdf` : `faktura-${key}.pdf`
    downloadUrl(blobUrl, label)
  }

  async function shareOrDownloadMain() {
    if (!blobUrl) return
    const key = (invoiceNumber || id || 'dokument').replace(/[^\w.-]+/g, '_')
    const label = isCreditNote ? `kreditnota-${key}.pdf` : `faktura-${key}.pdf`
    try {
      const blob = await fetch(blobUrl).then((r) => r.blob())
      const file = new File([blob], label, { type: 'application/pdf' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${isCreditNote ? 'Kreditnota' : 'Faktura'} ${invoiceNumber}`,
          files: [file],
        })
        return
      }
    } catch {
      /* Fallback to download below. */
    }
    downloadCreditNote()
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
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        Indlæser forhåndsvisning…
      </div>
    )
  }

  if (error || !blobUrl) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-red-600">{error ?? 'Kunne ikke vise PDF'}</p>
        <button
          type="button"
          className="text-indigo-600"
          onClick={() => navigate(id ? `/app/invoices/${id}` : '/app/invoices')}
        >
          Tilbage
        </button>
      </div>
    )
  }

  return (
    <div className="-mx-5 -mb-28 -mt-5 flex min-h-[calc(100dvh-5rem)] flex-1 flex-col bg-slate-100 md:-mx-10 md:-mb-8 md:-mt-9">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur md:px-5 md:pt-4">
        <div className="grid min-h-[2.75rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(id ? `/app/invoices/${id}` : '/app/invoices')}
            className="flex min-w-0 items-center justify-self-start pr-2 text-[15px] font-medium text-indigo-600"
          >
            <ChevronLeftIcon />
            <span className="truncate">
              {isCreditNote ? 'Kreditnota' : 'Faktura'} {invoiceNumber}
            </span>
          </button>
          <h1 className="max-w-[12rem] truncate text-center text-lg font-semibold text-slate-950 sm:max-w-none">
            {isCreditNote ? 'Kreditnota' : 'Faktura'} {invoiceNumber}
          </h1>
          <button
            type="button"
            onClick={() => void shareOrDownloadMain()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center justify-self-end text-indigo-600"
            aria-label="Del eller download PDF"
          >
            <ShareIcon />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-0 bg-slate-100 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-0">
        {isCreditNote && originalPdf ? (
          <section className="border-b border-slate-200">
            <div className="bg-slate-200/80 px-4 py-2 text-center text-xs font-medium text-slate-600">
              Oprindelig faktura {originalPdf.invoiceNumber}
              <Link
                to={`/app/invoices/${originalPdf.invoiceId}/pdf`}
                className="ml-2 text-indigo-600 hover:underline"
              >
                Åbn separat
              </Link>
            </div>
            <InvoicePdfCanvasViewer
              pdfUrl={originalPdf.url}
              title="Oprindelig faktura PDF"
              compactHeight
            />
          </section>
        ) : null}
        {isCreditNote ? (
          <div className="bg-indigo-100/80 px-4 py-2 text-center text-xs font-medium text-indigo-900">
            Kreditnota {invoiceNumber}
          </div>
        ) : null}
        <InvoicePdfCanvasViewer
          pdfUrl={blobUrl}
          title={isCreditNote ? 'Kreditnota PDF' : 'Faktura PDF'}
          compactHeight={isCreditNote}
        />
      </div>
    </div>
  )
}

function ChevronLeftIcon() {
  return (
    <svg
      className="-ml-1 h-7 w-7 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 12v8h14v-8" />
    </svg>
  )
}

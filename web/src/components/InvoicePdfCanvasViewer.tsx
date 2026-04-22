import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { ensurePdfjsWorker, pdfjsLib } from '@/lib/ensurePdfjsWorker'

const PADDING = 12
const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.75
const ZOOM_STEP = 0.15

type Props = {
  pdfUrl: string
  title: string
  className?: string
  compactHeight?: boolean
}

/**
 * Faktura-PDF: standard visning «fuld bredde» (hele arket synligt på tværs);
 * +/− for zoom, scroll når nødvendigt. Undgår iframes problematiske standard-zoom på mobil.
 */
export function InvoicePdfCanvasViewer({
  pdfUrl,
  title,
  className = '',
  compactHeight = false,
}: Props) {
  const measureRef = useRef<HTMLDivElement>(null)
  const pagesHostRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const renderTokenRef = useRef(0)
  const userZoomRef = useRef(1)
  const renderTasksRef = useRef<RenderTask[]>([])

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [useIframeFallback, setUseIframeFallback] = useState(false)
  const [userZoom, setUserZoom] = useState(1)
  userZoomRef.current = userZoom

  const resizeTRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelRenders = useCallback(() => {
    for (const t of renderTasksRef.current) {
      try {
        t.cancel()
      } catch {
        /* */
      }
    }
    renderTasksRef.current = []
  }, [])

  const getAvailableWidth = useCallback(() => {
    const el = measureRef.current
    if (!el) return 360
    return Math.max(120, el.clientWidth - PADDING * 2)
  }, [])

  const renderAllPages = useCallback(
    async (pdf: PDFDocumentProxy, token: number) => {
      const host = pagesHostRef.current
      if (!host) return
      cancelRenders()
      while (host.firstChild) host.removeChild(host.firstChild)
      const available = getAvailableWidth()
      const zoom = userZoomRef.current
      for (let p = 1; p <= pdf.numPages; p++) {
        if (token !== renderTokenRef.current) return
        const page: PDFPageProxy = await pdf.getPage(p)
        if (token !== renderTokenRef.current) return
        const base = page.getViewport({ scale: 1 })
        const fitScale = available / base.width
        const effectiveScale = fitScale * zoom
        const viewport = page.getViewport({ scale: effectiveScale })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) continue
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const task = page.render({ canvasContext: ctx, viewport, canvas })
        renderTasksRef.current.push(task)
        try {
          await task.promise
        } catch (e) {
          if (
            e &&
            typeof e === 'object' &&
            'name' in e &&
            (e as { name: string }).name === 'RenderingCancelledException'
          ) {
            return
          }
          if (String(e).includes('cancel')) return
          throw e
        }
        if (token !== renderTokenRef.current) return
        canvas.style.display = 'block'
        canvas.style.margin = '0 auto 12px'
        if (zoom <= 1.02) {
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
        } else {
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`
        }
        host.appendChild(canvas)
      }
    },
    [cancelRenders, getAvailableWidth],
  )

  const scheduleRepaint = useCallback(() => {
    const pdf = pdfRef.current
    if (!pdf || useIframeFallback) return
    renderTokenRef.current += 1
    const token = renderTokenRef.current
    setStatus('loading')
    void (async () => {
      try {
        await renderAllPages(pdf, token)
        if (token === renderTokenRef.current) setStatus('ready')
      } catch {
        if (token === renderTokenRef.current) setStatus('error')
      }
    })()
  }, [renderAllPages, useIframeFallback])

  // Hent / skift PDF
  useEffect(() => {
    setUseIframeFallback(false)
    setStatus('loading')
    setUserZoom(1)
    userZoomRef.current = 1
    renderTokenRef.current += 1
    const myToken = renderTokenRef.current
    let cancelled = false
    void (async () => {
      ensurePdfjsWorker()
      if (pdfRef.current) {
        try {
          await pdfRef.current.destroy()
        } catch {
          /* */
        }
        pdfRef.current = null
      }
      try {
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
        if (cancelled || myToken !== renderTokenRef.current) {
          void pdf.destroy()
          return
        }
        pdfRef.current = pdf
        await renderAllPages(pdf, myToken)
        if (cancelled || myToken !== renderTokenRef.current) return
        setStatus('ready')
      } catch (e) {
        console.warn('[pdf preview]', e)
        if (cancelled) return
        setUseIframeFallback(true)
        setStatus('ready')
      }
    })()
    return () => {
      cancelled = true
      renderTokenRef.current += 1
      cancelRenders()
      if (pagesHostRef.current) {
        while (pagesHostRef.current.firstChild) {
          pagesHostRef.current.removeChild(pagesHostRef.current.firstChild)
        }
      }
      const d = pdfRef.current
      pdfRef.current = null
      if (d) void d.destroy()
    }
  }, [pdfUrl, renderAllPages, cancelRenders])


  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (useIframeFallback) return
      if (resizeTRef.current) clearTimeout(resizeTRef.current)
      resizeTRef.current = setTimeout(() => {
        if (pdfRef.current) {
          scheduleRepaint()
        }
      }, 120)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (resizeTRef.current) clearTimeout(resizeTRef.current)
    }
  }, [scheduleRepaint, useIframeFallback, pdfUrl])

  function nudgeZoom(delta: number) {
    setUserZoom((z) => {
      const n = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100),
      )
      userZoomRef.current = n
      queueMicrotask(() => scheduleRepaint())
      return n
    })
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-2 py-1.5">
        <span className="text-xs text-slate-600">Forhåndsvisning</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => nudgeZoom(-ZOOM_STEP)}
            disabled={userZoom <= ZOOM_MIN}
            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Zoom ud"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setUserZoom(1)
              userZoomRef.current = 1
              if (pdfRef.current && !useIframeFallback) scheduleRepaint()
            }}
            className="max-w-[12rem] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-100"
            title="Vis hele fakturaen i skærmens bredde"
          >
            {Math.round(userZoom * 100)}% · Fuld bredde
          </button>
          <button
            type="button"
            onClick={() => nudgeZoom(ZOOM_STEP)}
            disabled={userZoom >= ZOOM_MAX}
            className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Zoom ind"
          >
            +
          </button>
        </div>
      </div>
      <div
        ref={measureRef}
        className={
          (compactHeight ? 'max-h-[48vh] ' : 'min-h-[50vh] sm:min-h-[60vh] ') +
          'relative w-full min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain bg-slate-200/50 [-webkit-overflow-scrolling:touch]'
        }
        style={{ touchAction: 'manipulation' }}
      >
        {useIframeFallback ? (
          <iframe
            title={title}
            src={pdfUrl}
            className="h-full min-h-[60vh] w-full border-0"
          />
        ) : status === 'error' ? (
          <p className="p-4 text-sm text-rose-700">Kunne ikke vise PDF. Brug download.</p>
        ) : (
          <>
            {status === 'loading' ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex min-h-[30vh] items-center justify-center bg-slate-100/80 text-sm text-slate-600">
                Indlæser forhåndsvisning…
              </div>
            ) : null}
            <div ref={pagesHostRef} className="p-2 pb-6" data-pdf-pages />
          </>
        )}
      </div>
    </div>
  )
}

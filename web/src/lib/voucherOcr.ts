import { createWorker } from 'tesseract.js'
import { cropCenterRegion, downscaleToCanvas } from '@/lib/documentDetect'
import { renderPdfFirstPageToCanvas } from '@/lib/pdfToCanvas'

/** Max kant på canvas før OCR — lavere på mobil for hastighed/hukommelse. */
export function maxOcrDimension(): number {
  if (typeof navigator === 'undefined') return 2400
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return 1600
  return 2400
}

/**
 * Logger der opdaterer fremskridt under hele Tesseract-start (ikke kun «recognizing text»),
 * så mobil ikke viser 0% mens wasm/sprogfiler hentes.
 */
export function tesseractLogger(onProgress?: (pct: number) => void) {
  let last = 0
  return (m: { status?: string; progress?: number }) => {
    if (typeof m.progress === 'number' && m.progress >= 0) {
      last = Math.max(last, Math.round(m.progress * 100))
      onProgress?.(last)
      return
    }
    const st = (m.status ?? '').toLowerCase()
    let bump = 0
    if (st.includes('loading') && st.includes('core')) bump = 6
    else if (st.includes('initializing tesseract')) bump = 12
    else if (st.includes('traineddata') || st.includes('language')) bump = 22
    else if (st.includes('initializing api')) bump = 30
    if (bump > 0) {
      last = Math.max(last, bump)
      onProgress?.(last)
    }
  }
}

/**
 * OCR af et canvas (fx kamerafangst eller PDF-side).
 * Samme strategi som billeder: midte først, derefter helt billede hvis lidt tekst.
 */
export async function ocrReceiptCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const maxDim = maxOcrDimension()
  const worker = await createWorker('dan+eng', undefined, {
    logger: tesseractLogger(onProgress),
  })
  try {
    const runRecognize = async (source: HTMLCanvasElement) => {
      const { data } = await worker.recognize(source)
      return data.text
    }

    const scaled = downscaleToCanvas(canvas, maxDim, maxDim)
    const cropped = cropCenterRegion(scaled, 0.06)
    let text = await runRecognize(cropped)
    if (text.trim().length < 40) {
      const fallback = await runRecognize(scaled)
      if (fallback.trim().length > text.trim().length) {
        text = fallback
      }
    }
    return text
  } finally {
    await worker.terminate()
  }
}

/**
 * OCR af PDF (første side) eller billede til tekst.
 * PDF: hele siden (fakturaer har ofte total i bunden).
 * Billede: let beskæring som ved kvitteringsfoto.
 */
export async function ocrImageOrPdfFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  let canvas: HTMLCanvasElement
  if (isPdf) {
    canvas = await renderPdfFirstPageToCanvas(file, 2.5)
  } else if (file.type.startsWith('image/')) {
    const img = new Image()
    const url = URL.createObjectURL(file)
    try {
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
    } finally {
      URL.revokeObjectURL(url)
    }
  } else {
    throw new Error('OCR understøtter PDF og billeder (jpeg, png, …).')
  }

  const maxDim = maxOcrDimension()
  const worker = await createWorker('dan+eng', undefined, {
    logger: tesseractLogger(onProgress),
  })
  try {
    const runRecognize = async (source: HTMLCanvasElement) => {
      const { data } = await worker.recognize(source)
      return data.text
    }

    if (isPdf) {
      const scaled = downscaleToCanvas(canvas, maxDim, maxDim)
      return await runRecognize(scaled)
    }

    /* Billede: start med midterudsnit (kvittering i ramme); hvis næsten ingen tekst, prøv hele billedet. */
    const cropped = cropCenterRegion(canvas, 0.06)
    let text = await runRecognize(cropped)
    if (text.trim().length < 40) {
      const full = downscaleToCanvas(canvas, maxDim, maxDim)
      const fallback = await runRecognize(full)
      if (fallback.trim().length > text.trim().length) {
        text = fallback
      }
    }
    return text
  } finally {
    await worker.terminate()
  }
}

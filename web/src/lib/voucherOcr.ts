import { createWorker } from 'tesseract.js'
import { cropCenterRegion, downscaleToCanvas } from '@/lib/documentDetect'
import { renderPdfFirstPageToCanvas } from '@/lib/pdfToCanvas'

/** PDF eller billede vi kan forsøge OCR på (inkl. HEIC og filer uden MIME). */
export function canAttemptVoucherOcr(file: File): boolean {
  const n = file.name.toLowerCase()
  if (file.type === 'application/pdf' || n.endsWith('.pdf')) return true
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(n)
}

async function convertHeicToJpegIfNeeded(file: File): Promise<File> {
  const name = file.name.toLowerCase()
  const mime = (file.type || '').toLowerCase()
  const isHeic =
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  if (!isHeic) return file

  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const base = file.name.replace(/\.(heic|heif)$/i, '') || 'bilag'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

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
  } else if (canAttemptVoucherOcr(file) && !isPdf) {
    const imageFile = await convertHeicToJpegIfNeeded(file)
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () =>
          reject(
            new Error(
              'Billede kunne ikke vises i browseren (fx HEIC på ældre browser — prøv JPEG/PNG eller «Scan bilag» på mobil).',
            ),
          )
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
    throw new Error('OCR understøtter PDF og billeder (jpeg, png, HEIC, …).')
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

    /* Nedskaler først (store mobilfotos), derefter midte → hele billedet som ved kamera-scan. */
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

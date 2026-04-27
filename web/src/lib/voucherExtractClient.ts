/**
 * Primær bilagslæsning via Claude Haiku vision (edge function `voucher-extract`),
 * med automatisk fallback til Tesseract+heuristik hvis API'et fejler eller
 * ikke er konfigureret. Output er normaliseret til samme felter som
 * `ParsedReceipt` så callers ikke skal kende kilden.
 */
import { blobToBase64 } from '@/lib/blobToBase64'
import { downscaleToCanvas } from '@/lib/documentDetect'
import { invokeVoucherExtract, type VoucherExtractionResult } from '@/lib/edge'
import { ocrReceiptCanvas, ocrImageOrPdfFile } from '@/lib/voucherOcr'
import { parseDanishReceiptText, type ParsedReceipt } from '@/lib/receiptParse'

export type ExtractedVoucher = ParsedReceipt & {
  /** Hvor data kom fra — driver konfidens-UI og fallback-besked. */
  source: 'ai' | 'ocr-heuristic'
  /** AI-confidence (0-1) hvis source=ai. */
  confidence: number | null
  /** AI-noter (forbehold). */
  aiNotes: string | null
}

/** Maks længste kant ved upload til AI — holder token-cost lavt. */
const AI_MAX_DIMENSION = 1024

function aiToParsedReceipt(ai: VoucherExtractionResult): ExtractedVoucher {
  return {
    totalKr: ai.total_cents != null ? ai.total_cents / 100 : null,
    expenseDate: ai.expense_date,
    expenseDateIso: ai.expense_date,
    vatRateGuess: ai.vat_rate,
    lineItems: ai.line_items.map(
      (l) => `${l.description} ${(l.amount_cents / 100).toFixed(2).replace('.', ',')}`,
    ),
    merchantGuess: ai.merchant,
    rawSnippet: ai.notes ?? '',
    source: 'ai',
    confidence: ai.confidence,
    aiNotes: ai.notes,
  }
}

function tesseractToParsed(parsed: ParsedReceipt): ExtractedVoucher {
  return {
    ...parsed,
    source: 'ocr-heuristic',
    confidence: null,
    aiNotes: null,
  }
}

async function canvasToJpegBase64(canvas: HTMLCanvasElement): Promise<{
  base64: string
  mimeType: string
}> {
  const scaled = downscaleToCanvas(canvas, AI_MAX_DIMENSION, AI_MAX_DIMENSION)
  const blob = await new Promise<Blob | null>((res) =>
    scaled.toBlob((b) => res(b), 'image/jpeg', 0.85),
  )
  if (!blob) throw new Error('Kunne ikke konvertere canvas til JPEG')
  const base64 = await blobToBase64(blob)
  return { base64, mimeType: 'image/jpeg' }
}

/**
 * Læs et bilag fra et canvas (kamera-fangst eller PDF-side).
 * Prøver AI først; fallback til Tesseract+heuristik ved fejl.
 */
export async function extractVoucherFromCanvas(
  canvas: HTMLCanvasElement,
  onTesseractProgress?: (pct: number) => void,
): Promise<ExtractedVoucher> {
  try {
    const { base64, mimeType } = await canvasToJpegBase64(canvas)
    const ai = await invokeVoucherExtract({ imageBase64: base64, imageMimeType: mimeType })
    return aiToParsedReceipt(ai)
  } catch (err) {
    console.warn('[voucher-extract] AI fejlede, falder tilbage til Tesseract', err)
    const text = await ocrReceiptCanvas(canvas, onTesseractProgress)
    return tesseractToParsed(parseDanishReceiptText(text))
  }
}

/**
 * Læs et bilag fra en uploadet fil (billede eller PDF).
 * AI-pathen kører kun på billeder; PDF'er går direkte til Tesseract
 * (kræver server-side rendering vi ikke har endnu).
 */
export async function extractVoucherFromFile(
  file: File,
  onTesseractProgress?: (pct: number) => void,
): Promise<ExtractedVoucher> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  // PDF: render første side til canvas, så AI også kan læse den
  if (isPdf) {
    try {
      const { renderPdfFirstPageToCanvas } = await import('@/lib/pdfToCanvas')
      const canvas = await renderPdfFirstPageToCanvas(file, 2.5)
      return await extractVoucherFromCanvas(canvas, onTesseractProgress)
    } catch (err) {
      console.warn('[voucher-extract] PDF-render fejlede, falder tilbage', err)
      const text = await ocrImageOrPdfFile(file, onTesseractProgress)
      return tesseractToParsed(parseDanishReceiptText(text))
    }
  }

  // Billede: konverter direkte til base64 og send til AI
  try {
    const { base64, mimeType } = await fileToBase64(file)
    const ai = await invokeVoucherExtract({ imageBase64: base64, imageMimeType: mimeType })
    return aiToParsedReceipt(ai)
  } catch (err) {
    console.warn('[voucher-extract] AI på fil fejlede, falder tilbage', err)
    const text = await ocrImageOrPdfFile(file, onTesseractProgress)
    return tesseractToParsed(parseDanishReceiptText(text))
  }
}

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  // Hvis filen er stor, downscale via canvas først
  if (file.size > 1_500_000) {
    const img = new Image()
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Billede kunne ikke læses'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas')
      ctx.drawImage(img, 0, 0)
      return await canvasToJpegBase64(canvas)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const base64 = await blobToBase64(file)
  // Anthropic accepterer JPEG/PNG/GIF/WEBP. Default til JPEG hvis MIME mangler.
  const mime = file.type && /^image\/(jpeg|png|gif|webp)$/.test(file.type) ? file.type : 'image/jpeg'
  return { base64, mimeType: mime }
}

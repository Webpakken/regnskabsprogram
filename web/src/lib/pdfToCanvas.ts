import { ensurePdfjsWorker, pdfjsLib } from '@/lib/ensurePdfjsWorker'

/** Første side af PDF som canvas (til OCR). */
export async function renderPdfFirstPageToCanvas(
  file: File,
  scale = 2,
): Promise<HTMLCanvasElement> {
  ensurePdfjsWorker()
  const buf = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buf })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas ikke tilgængelig')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const task = page.render({ canvasContext: ctx, canvas, viewport })
  await task.promise
  return canvas
}

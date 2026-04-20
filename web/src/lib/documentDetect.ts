/**
 * Enkel billedanalyse: måler kant-styrke i midten af billedet for at
 * gætte "bilag i ramme" (ikke ML — god nok til at vise "Søger efter bilag" / fundet).
 */

export function scoreDocumentPresence(imageData: ImageData): number {
  const { data, width, height } = imageData
  const cx0 = Math.floor(width * 0.2)
  const cx1 = Math.floor(width * 0.8)
  const cy0 = Math.floor(height * 0.2)
  const cy1 = Math.floor(height * 0.8)

  let sum = 0
  let n = 0
  const step = 2

  for (let y = cy0; y < cy1; y += step) {
    for (let x = cx0; x < cx1; x += step) {
      const i = (y * width + x) * 4
      const gx = Math.abs(gray(data, i) - gray(data, i + 4))
      const gy = Math.abs(gray(data, i) - gray(data, i + width * 4))
      sum += gx + gy
      n++
    }
  }
  if (n === 0) return 0
  const raw = sum / n / 255
  /* Normalisér groft til 0–1 */
  return Math.min(1, raw * 4)
}

function gray(data: Uint8ClampedArray, i: number): number {
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
}

export function downscaleToCanvas(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  maxW: number,
  maxH: number,
): HTMLCanvasElement {
  const w =
    'videoWidth' in source
      ? source.videoWidth
      : 'naturalWidth' in source
        ? source.naturalWidth
        : source.width
  const h =
    'videoHeight' in source
      ? source.videoHeight
      : 'naturalHeight' in source
        ? source.naturalHeight
        : source.height
  let tw = w
  let th = h
  const r = Math.min(maxW / tw, maxH / th, 1)
  tw = Math.floor(tw * r)
  th = Math.floor(th * r)
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d')
  if (!ctx) return c
  ctx.drawImage(source, 0, 0, tw, th)
  return c
}

/** Klip til kvadratisk område i midten (simuleret "dokument") — bruges før OCR for fokus */
export function cropCenterRegion(
  source: HTMLCanvasElement,
  marginFrac = 0.08,
): HTMLCanvasElement {
  const w = source.width
  const h = source.height
  const mx = Math.floor(w * marginFrac)
  const my = Math.floor(h * marginFrac)
  const cw = w - 2 * mx
  const ch = h - 2 * my
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const ctx = c.getContext('2d')
  if (!ctx) return c
  ctx.drawImage(source, mx, my, cw, ch, 0, 0, cw, ch)
  return c
}

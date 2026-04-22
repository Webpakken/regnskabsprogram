import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let configured = false

export function ensurePdfjsWorker() {
  if (configured) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
  configured = true
}

export { pdfjsLib }

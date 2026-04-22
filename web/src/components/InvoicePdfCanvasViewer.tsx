type Props = {
  pdfUrl: string
  title: string
  className?: string
  /** Kreditnota: lavere max-højde så oprindelig + kredit kan ses oven på hinanden. */
  compactHeight?: boolean
}

/**
 * Faktura-PDF i browserens indbyggede viewer (fuld bredde). På mobil bruges PDF’ens
 * egen scroll/zoom — ingen separat zoom-rail.
 */
export function InvoicePdfCanvasViewer({
  pdfUrl,
  title,
  className = '',
  compactHeight = false,
}: Props) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div
        className={
          'min-h-0 flex-1 overflow-auto bg-slate-200/50 [-webkit-overflow-scrolling:touch] ' +
          (compactHeight ? 'max-h-[42vh] sm:max-h-[48vh]' : '')
        }
      >
        <iframe
          title={title}
          src={pdfUrl}
          className={
            'block w-full border-0 ' +
            (compactHeight ? 'min-h-[38vh]' : 'min-h-[min(75dvh,52rem)]')
          }
        />
      </div>
    </div>
  )
}

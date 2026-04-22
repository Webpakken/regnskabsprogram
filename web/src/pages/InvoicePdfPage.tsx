import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob, type InvoicePdfOptions } from '@/lib/invoicePdf'
import { lineAmounts } from '@/lib/invoiceMath'
import { sendInvoiceToCustomerEmail } from '@/lib/invoiceCustomerEmail'
import { InvoicePdfCanvasViewer } from '@/components/InvoicePdfCanvasViewer'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

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
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mailBusy, setMailBusy] = useState<'reminder' | 'dunning' | null>(null)
  const [mailNotice, setMailNotice] = useState<string | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [invoiceReloadNonce, setInvoiceReloadNonce] = useState(0)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    setMailNotice(null)
  }, [id, currentCompany?.id])

  useEffect(() => {
    if (!actionMenuOpen) return
    const close = (e: PointerEvent) => {
      if (
        actionMenuRef.current &&
        e.target instanceof Node &&
        !actionMenuRef.current.contains(e.target)
      ) {
        setActionMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [actionMenuOpen])

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
      const { data: inv, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .eq('company_id', currentCompany.id)
        .single()
      if (e1 || !inv) {
        if (!cancelled) {
          setError('Faktura ikke fundet')
          setLoading(false)
        }
        return
      }
      const { data: li, error: e2 } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', id)
        .order('sort_order', { ascending: true })
      if (e2) {
        if (!cancelled) {
          setError(e2.message)
          setLoading(false)
        }
        return
      }
      const logo = await fetchCompanyLogoDataUrl(currentCompany.invoice_logo_path)

      // Kreditnota: byg også PDF for den oprindelige faktura (vist over kreditnotaen)
      if (inv.credited_invoice_id) {
        const { data: origInv, error: oe } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', inv.credited_invoice_id)
          .eq('company_id', currentCompany.id)
          .maybeSingle()
        if (!oe && origInv) {
          const { data: origLi } = await supabase
            .from('invoice_line_items')
            .select('*')
            .eq('invoice_id', origInv.id)
            .order('sort_order', { ascending: true })
          if (!cancelled) {
            const origBlob = generateInvoicePdfBlob(
              currentCompany,
              origInv as Invoice,
              (origLi ?? []) as LineRow[],
              logo,
            )
            const origUrl = URL.createObjectURL(origBlob)
            objectUrlsRef.current.push(origUrl)
            setOriginalPdf({
              url: origUrl,
              invoiceNumber: String(origInv.invoice_number ?? '').trim() || '—',
              invoiceId: origInv.id,
            })
          }
        } else {
          if (!cancelled) setOriginalPdf(null)
        }
      } else {
        if (!cancelled) setOriginalPdf(null)
      }

      let pdfOptions: InvoicePdfOptions | undefined
      if (inv.credited_invoice_id) {
        const { data: refInv } = await supabase
          .from('invoices')
          .select('invoice_number')
          .eq('id', inv.credited_invoice_id)
          .maybeSingle()
        pdfOptions = {
          heading: 'Kreditnota',
          creditReferenceLine: refInv?.invoice_number
            ? `Krediterer faktura ${refInv.invoice_number}`
            : 'Kreditnota',
        }
      }
      const blob = generateInvoicePdfBlob(
        currentCompany,
        inv as Invoice,
        (li ?? []) as LineRow[],
        logo,
        pdfOptions,
      )
      const url = URL.createObjectURL(blob)
      objectUrlsRef.current.push(url)
      if (!cancelled) {
        setInvoiceNumber(inv.invoice_number)
        setIsCreditNote(!!inv.credited_invoice_id)
        setCustomerEmail(inv.customer_email?.trim() || null)
        setBlobUrl(url)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      revokeAllBlobUrls()
    }
  }, [id, currentCompany, invoiceReloadNonce])

  /** 100 kr inkl. 25 % moms → net 80 kr pr. stk. */
  async function addRykkerGebyrLine(invoiceId: string, companyId: string) {
    const { data: inv, error: e1 } = await supabase
      .from('invoices')
      .select('net_cents, vat_cents, gross_cents')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .single()
    if (e1 || !inv) throw new Error(e1?.message ?? 'Kunne ikke hente faktura')
    const { data: orderRows, error: e2 } = await supabase
      .from('invoice_line_items')
      .select('sort_order')
      .eq('invoice_id', invoiceId)
    if (e2) throw new Error(e2.message)
    const maxOrder = orderRows?.length ? Math.max(...orderRows.map((r) => r.sort_order)) : -1
    const sort_order = maxOrder + 1
    const draft = {
      description: 'Rykkergebyr',
      quantity: 1,
      unit_price_cents: 8000,
      vat_rate: 25,
    }
    const { line_net_cents, line_vat_cents, line_gross_cents } = lineAmounts(draft)
    const { error: e3 } = await supabase.from('invoice_line_items').insert({
      invoice_id: invoiceId,
      description: 'Rykkergebyr',
      quantity: 1,
      unit_price_cents: 8000,
      vat_rate: 25,
      line_net_cents,
      line_vat_cents,
      line_gross_cents,
      sort_order,
    })
    if (e3) throw new Error(e3.message)
    const { error: e4 } = await supabase
      .from('invoices')
      .update({
        net_cents: inv.net_cents + line_net_cents,
        vat_cents: inv.vat_cents + line_vat_cents,
        gross_cents: inv.gross_cents + line_gross_cents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .eq('company_id', companyId)
    if (e4) throw new Error(e4.message)
  }

  function downloadUrl(url: string, fileLabel: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = fileLabel
    a.click()
  }

  function downloadCreditNote() {
    if (!blobUrl) return
    const key = (invoiceNumber || id || 'dokument').replace(/[^\w.\-]+/g, '_')
    const label = isCreditNote ? `kreditnota-${key}.pdf` : `faktura-${key}.pdf`
    downloadUrl(blobUrl, label)
  }

  function downloadOriginal() {
    if (!originalPdf) return
    const safe = originalPdf.invoiceNumber.replace(/[^\w.\-]+/g, '_')
    downloadUrl(originalPdf.url, `faktura-oprindelig-${safe}.pdf`)
  }

  async function sendMail(
    kind: 'invoice_reminder' | 'invoice_dunning',
    opts?: { addDunningFee?: boolean },
  ) {
    if (!id || !currentCompany) return
    const to = customerEmail
    if (!to) {
      setMailNotice('Kundens e-mail mangler. Uden e-mail kan påmindelse/rykker ikke sendes.')
      return
    }
    setMailNotice(null)
    setActionMenuOpen(false)
    setMailBusy(kind === 'invoice_reminder' ? 'reminder' : 'dunning')
    const addFee = kind === 'invoice_dunning' && opts?.addDunningFee === true
    let dunningFeeSaved = false
    try {
      const { data: company, error: ce } = await supabase
        .from('companies')
        .select('*')
        .eq('id', currentCompany.id)
        .single()
      if (ce || !company) {
        throw new Error(ce?.message ?? 'Kunne ikke hente virksomhed')
      }
      if (addFee) {
        await addRykkerGebyrLine(id, currentCompany.id)
        dunningFeeSaved = true
      }
      await sendInvoiceToCustomerEmail({ company, invoiceId: id, kind })
      if (addFee) {
        setInvoiceReloadNonce((n) => n + 1)
      }
      setMailNotice(
        kind === 'invoice_reminder'
          ? 'Påmindelse sendt til kunden (hvis skabelon er slået til).'
          : addFee
            ? 'Rykkergebyr på 100 kr (inkl. moms) er tilføjet på fakturaen. Rykker sendt til kunden (hvis skabelon er slået til).'
            : 'Rykker sendt til kunden (hvis skabelon er slået til).',
      )
    } catch (e) {
      if (dunningFeeSaved) {
        setInvoiceReloadNonce((n) => n + 1)
        const msg = e instanceof Error ? e.message : 'Kunne ikke sende e-mail'
        setMailNotice(
          `${msg} Rykkergebyret er tilføjet på fakturaen — du kan prøve at sende rykker igen.`,
        )
      } else {
        setMailNotice(e instanceof Error ? e.message : 'Kunne ikke sende e-mail')
      }
    } finally {
      setMailBusy(null)
    }
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
          onClick={() => navigate('/app/invoices')}
        >
          Tilbage til fakturaer
        </button>
      </div>
    )
  }

  const canCredit = !isCreditNote

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/invoices')}
              className="shrink-0 text-sm font-medium text-indigo-600 hover:underline"
            >
              ← Tilbage
            </button>
            <h1 className="min-w-0 text-base font-semibold text-slate-900 sm:text-lg">
              {isCreditNote ? 'Kreditnota' : 'Faktura'} {invoiceNumber}
            </h1>
            <span className="text-xs text-slate-500">Forhåndsvisning</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {isCreditNote && originalPdf ? (
              <button
                type="button"
                onClick={downloadOriginal}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Download oprindelig faktura
              </button>
            ) : null}
            <button
              type="button"
              onClick={downloadCreditNote}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {isCreditNote ? 'Download kreditnota' : 'Download PDF'}
            </button>
          </div>
          <div className="relative" ref={actionMenuRef}>
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              aria-expanded={actionMenuOpen}
              aria-haspopup="true"
              aria-label="Handlinger på faktura"
              onClick={() => setActionMenuOpen((o) => !o)}
            >
              <IconEllipsis />
            </button>
            {actionMenuOpen ? (
              <ul
                className="absolute right-0 z-20 mt-1.5 w-[min(100vw-1.5rem,18rem)] rounded-xl border border-slate-200 bg-white py-1.5 text-sm shadow-lg"
                role="menu"
              >
                <li>
                  {canCredit ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-4 py-3 text-left text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        setActionMenuOpen(false)
                        if (id) navigate(`/app/invoices/new?creditFor=${id}`)
                      }}
                    >
                      Opret kredit
                    </button>
                  ) : (
                    <span
                      className="block w-full cursor-not-allowed px-4 py-3 text-slate-400"
                      title="Kredit laves ud fra en almindelig faktura, ikke en kreditnota"
                    >
                      Opret kredit
                    </span>
                  )}
                </li>
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!!mailBusy}
                    className="w-full px-4 py-3 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Er du sikker på, at du vil sende en påmindelse via e-mail til kunden?',
                        )
                      ) {
                        return
                      }
                      void sendMail('invoice_reminder')
                    }}
                  >
                    {mailBusy === 'reminder' ? 'Sender påmindelse…' : 'Send påmindelse'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!!mailBusy}
                    className="w-full px-4 py-3 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Er du sikker på, at du vil sende en rykker via e-mail til kunden?',
                        )
                      ) {
                        return
                      }
                      const addFee =
                        !isCreditNote &&
                        window.confirm(
                          'Skal der tilføjes 100 kr rykkergebyr (inkl. moms) på fakturaen?',
                        )
                      void sendMail('invoice_dunning', { addDunningFee: addFee })
                    }}
                  >
                    {mailBusy === 'dunning' ? 'Sender rykker…' : 'Send rykker'}
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500 sm:text-sm">
          {isCreditNote
            ? 'Kreditnota: du ser først den oprindelige faktura, derefter kreditnotaen. Standard er hele siden i skærmens bredde; brug +/− for at zoome. Data gemmes som linjer; PDF genereres til visning og download. En afsendt faktura kan ikke ændres — kredit følger efterbetalingsmønsteret.'
            : 'Standard vises hele fakturaen i skærmens bredde; brug +/− for at zoome ind. Samme PDF som ved download — data gemmes som linjer. En afsendt faktura kan ikke ændres — brug kredit hvis nødvendigt.'}
        </p>
        {mailNotice ? (
          <p className="text-sm text-slate-700" role="status">
            {mailNotice}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0 bg-slate-100">
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

function IconEllipsis() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  )
}

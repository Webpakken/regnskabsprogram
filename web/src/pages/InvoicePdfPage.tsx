import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob, type InvoicePdfOptions } from '@/lib/invoicePdf'
import { sendInvoiceToCustomerEmail } from '@/lib/invoiceCustomerEmail'
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
      setMailNotice(null)
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
  }, [id, currentCompany])

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

  async function sendMail(kind: 'invoice_reminder' | 'invoice_dunning') {
    if (!id || !currentCompany) return
    const to = customerEmail
    if (!to) {
      setMailNotice('Kunden har ingen e-mail — tilføj den under Rediger faktura.')
      return
    }
    setMailNotice(null)
    setMailBusy(kind === 'invoice_reminder' ? 'reminder' : 'dunning')
    try {
      const { data: company, error: ce } = await supabase
        .from('companies')
        .select('*')
        .eq('id', currentCompany.id)
        .single()
      if (ce || !company) {
        throw new Error(ce?.message ?? 'Kunne ikke hente virksomhed')
      }
      await sendInvoiceToCustomerEmail({ company, invoiceId: id, kind })
      setMailNotice(
        kind === 'invoice_reminder'
          ? 'Påmindelse sendt til kunden (hvis skabelon er slået til).'
          : 'Rykker sendt til kunden (hvis skabelon er slået til).',
      )
    } catch (e) {
      setMailNotice(e instanceof Error ? e.message : 'Kunne ikke sende e-mail')
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
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isCreditNote && originalPdf ? (
              <button
                type="button"
                onClick={downloadOriginal}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Download oprindelig faktura
              </button>
            ) : null}
            <button
              type="button"
              onClick={downloadCreditNote}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {isCreditNote ? 'Download kreditnota' : 'Download PDF'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 sm:text-sm">
          {isCreditNote
            ? 'Kreditnota: du ser først den oprindelige faktura, derefter kreditnotaen. Data gemmes som linjer i Bilago; PDF’erne genereres til visning og download.'
            : 'Dette er den samme PDF som ved download — gemt i Bilago som linjer, vist her som forhåndsvisning.'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            to={`/app/invoices/${id}`}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Rediger faktura
          </Link>
          {canCredit ? (
            <Link
              to={`/app/invoices/new?creditFor=${id}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
            >
              Opret kreditnota
            </Link>
          ) : null}
          <button
            type="button"
            disabled={!!mailBusy}
            onClick={() => void sendMail('invoice_reminder')}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {mailBusy === 'reminder' ? 'Sender…' : 'Send påmindelse'}
          </button>
          <button
            type="button"
            disabled={!!mailBusy}
            onClick={() => void sendMail('invoice_dunning')}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950 hover:bg-rose-100 disabled:opacity-50"
          >
            {mailBusy === 'dunning' ? 'Sender…' : 'Send rykker'}
          </button>
        </div>
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
            <iframe
              title="Oprindelig faktura PDF"
              src={originalPdf.url}
              className="min-h-[50vh] w-full border-0 bg-white"
            />
          </section>
        ) : null}
        {isCreditNote ? (
          <div className="bg-indigo-100/80 px-4 py-2 text-center text-xs font-medium text-indigo-900">
            Kreditnota {invoiceNumber}
          </div>
        ) : null}
        <iframe
          title={isCreditNote ? 'Kreditnota PDF' : 'Faktura PDF'}
          src={blobUrl}
          className={
            (isCreditNote ? 'min-h-[45vh] ' : 'min-h-[70vh] ') +
            'w-full flex-1 border-0 bg-slate-100'
          }
        />
      </div>
    </div>
  )
}

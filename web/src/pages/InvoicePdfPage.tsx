import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob } from '@/lib/invoicePdf'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

export function InvoicePdfPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentCompany } = useApp()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!id || !currentCompany) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setBlobUrl(null)
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
      const blob = generateInvoicePdfBlob(
        currentCompany,
        inv as Invoice,
        (li ?? []) as LineRow[],
        logo,
      )
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      if (!cancelled) {
        setInvoiceNumber(inv.invoice_number)
        setBlobUrl(url)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [id, currentCompany])

  function download() {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `faktura-${invoiceNumber || id}.pdf`
    a.click()
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
        Genererer PDF…
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

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/app/invoices')}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Tilbage
          </button>
          <Link
            to={`/app/invoices/${id}`}
            className="text-sm font-medium text-slate-600 hover:text-indigo-600 hover:underline"
          >
            Rediger faktura
          </Link>
        </div>
        <button
          type="button"
          onClick={download}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Download PDF
        </button>
      </div>
      <iframe
        title="Faktura PDF"
        src={blobUrl}
        className="min-h-[75vh] w-full flex-1 rounded-b-2xl border border-t-0 border-slate-200 bg-slate-100"
      />
    </div>
  )
}

import { useLayoutEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LoadingCentered } from '@/components/LoadingIndicator'

/**
 * Tidligere «klassisk» faktura-editor. Fakturaer og kreditnotaer må ikke redigeres efter
 * oprettelse — omdiriger til detaljevisning.
 */
export function InvoiceEditorPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  useLayoutEffect(() => {
    if (id) void navigate(`/app/invoices/${id}`, { replace: true })
    else void navigate('/app/invoices', { replace: true })
  }, [id, navigate])
  return <LoadingCentered minHeight="min-h-[50vh]" srLabel="Åbner faktura" />
}

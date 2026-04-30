import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { InvoicePdfCanvasViewer } from '@/components/InvoicePdfCanvasViewer'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { DesktopListCardsToggle } from '@/components/DesktopListCardsToggle'
import { useDesktopListViewPreference } from '@/hooks/useDesktopListViewPreference'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { formatDateOnly, formatDkk } from '@/lib/format'
import { formatParsedNotes } from '@/lib/receiptParse'
import { canAttemptVoucherOcr } from '@/lib/voucherOcr'
import { extractVoucherFromFile } from '@/lib/voucherExtractClient'
import { VOUCHER_CATEGORY_OPTIONS, inferVoucherCategory } from '@/lib/voucherCategories'
import { expenseLinkUrl, randomExpenseLinkToken, sha256Hex } from '@/lib/expenseLinks'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'
import type { CompanyRole, Database } from '@/types/database'

type Voucher = Database['public']['Tables']['vouchers']['Row']
type VoucherProject = Database['public']['Tables']['voucher_projects']['Row']
type ExpenseLinkMode = Database['public']['Tables']['expense_upload_links']['Row']['mode']
type Reimbursement = Database['public']['Tables']['voucher_reimbursements']['Row']
type ReimbursementStatus = Reimbursement['status']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const VOUCHERS_VIEW_KEY = 'bilago:vouchersDesktopView'

type VoucherSortKey = 'date' | 'title' | 'category' | 'project' | 'gross' | 'vat'

function canWriterDeleteVouchers(role: CompanyRole | null) {
  return role === 'owner' || role === 'manager' || role === 'bookkeeper'
}

const reimbursementStatusLabels: Record<ReimbursementStatus, string> = {
  pending_approval: 'Afventer godkendelse',
  ready_for_refund: 'Klar til refundering',
  refunded: 'Refunderet',
  rejected: 'Afvist',
}

function isVoucherProjectSchemaError(error: { message?: string; code?: string } | null) {
  const msg = error?.message?.toLowerCase() ?? ''
  return error?.code === 'PGRST205' || msg.includes('voucher_projects') || msg.includes('voucher_project_id')
}

const VOUCHER_PAGE_SIZE = 25

const VOUCHER_SORT_COLUMN: Record<VoucherSortKey, string> = {
  date: 'expense_date',
  title: 'title',
  category: 'category',
  project: 'voucher_project_id',
  gross: 'gross_cents',
  vat: 'vat_cents',
}

/** Escape brugerinput så det ikke ødelægger PostgREST `or()`-syntaksen. */
function sanitizeIlikeQuery(input: string): string {
  return input.replace(/[%,()*]/g, ' ').trim()
}

export function VouchersPage() {
  const { currentCompany, user, currentRole, billingEntitlements, canUse } = useApp()
  const isForening = currentCompany?.entity_type === 'forening'
  const checkout = useStripeCheckoutLauncher()
  const [searchParams, setSearchParams] = useSearchParams()
  const [desktopView, setDesktopView] = useDesktopListViewPreference(VOUCHERS_VIEW_KEY, 'list')
  const [rows, setRows] = useState<Voucher[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [projects, setProjects] = useState<VoucherProject[]>([])
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<'all' | 'none' | string>('all')
  const [newProjectName, setNewProjectName] = useState('')
  const [projectCreateOpen, setProjectCreateOpen] = useState(false)
  const [projectFeatureUnavailable, setProjectFeatureUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrWarning, setOcrWarning] = useState<string | null>(null)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const overlayDragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [sortKey, setSortKey] = useState<VoucherSortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expenseLinkMode, setExpenseLinkMode] = useState<ExpenseLinkMode>('single_use')
  const [creatingExpenseLink, setCreatingExpenseLink] = useState(false)
  const [expenseLink, setExpenseLink] = useState<string | null>(null)
  const [expenseLinkModalOpen, setExpenseLinkModalOpen] = useState(false)
  const [expenseLinkCopied, setExpenseLinkCopied] = useState(false)
  const [projectOverviewOpen, setProjectOverviewOpen] = useState(false)
  const [preview, setPreview] = useState<{ voucher: Voucher; url: string } | null>(null)

  const canDeleteVoucher = canWriterDeleteVouchers(currentRole)
  const featureGateKnown = billingEntitlements.length > 0
  const canUseVoucherProjects = !featureGateKnown || canUse('voucher_projects')
  const canUseExpenseLinks = !featureGateKnown || canUse('expense_links')

  // Debounce søgefeltet (300ms) så vi ikke fyrer en server-query af på hvert tastetryk.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  const buildVoucherQuery = useCallback(
    (offset: number, limit: number) => {
      if (!currentCompany) return null
      let q = supabase
        .from('vouchers')
        .select('*', { count: 'exact' })
        .eq('company_id', currentCompany.id)
      const safe = sanitizeIlikeQuery(debouncedSearch)
      if (safe) {
        q = q.or(
          `title.ilike.%${safe}%,filename.ilike.%${safe}%,category.ilike.%${safe}%,notes.ilike.%${safe}%`,
        )
      }
      if (projectFilter === 'none') {
        q = q.is('voucher_project_id', null)
      } else if (projectFilter !== 'all') {
        q = q.eq('voucher_project_id', projectFilter)
      }
      const sortCol = sortKey ? VOUCHER_SORT_COLUMN[sortKey] : 'uploaded_at'
      const ascending = sortKey ? sortDir === 'asc' : false
      q = q.order(sortCol, { ascending, nullsFirst: false })
      // Stabil tiebreaker så pagineringen ikke springer i rækkefølge.
      q = q.order('id', { ascending: false })
      return q.range(offset, offset + limit - 1)
    },
    [currentCompany, debouncedSearch, projectFilter, sortKey, sortDir],
  )

  // Hent første side + sideforløb-data (projekter, refusioner) når deps ændres.
  useEffect(() => {
    if (!currentCompany) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const query = buildVoucherQuery(0, VOUCHER_PAGE_SIZE)
      const [voucherRes, projectRes, reimbursementRes] = await Promise.all([
        query,
        supabase
          .from('voucher_projects')
          .select('*')
          .eq('company_id', currentCompany.id)
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('voucher_reimbursements')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      if (voucherRes?.error) {
        setError(voucherRes.error.message)
      }
      const data = voucherRes?.data ?? []
      const count = voucherRes?.count ?? 0
      setRows(data)
      setTotalCount(count)
      setHasMore(data.length < count)
      setReimbursements(reimbursementRes.data ?? [])
      if (isVoucherProjectSchemaError(projectRes.error)) {
        setProjectFeatureUnavailable(true)
        setProjects([])
      } else {
        setProjectFeatureUnavailable(false)
        setProjects(projectRes.data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [buildVoucherQuery, currentCompany])

  const loadMoreVouchers = useCallback(async () => {
    if (loadingMore || !hasMore || !currentCompany) return
    setLoadingMore(true)
    const offset = rows.length
    const query = buildVoucherQuery(offset, VOUCHER_PAGE_SIZE)
    if (!query) {
      setLoadingMore(false)
      return
    }
    const { data, count, error: pageErr } = await query
    if (pageErr) {
      setError(pageErr.message)
      setLoadingMore(false)
      return
    }
    const next = data ?? []
    setRows((prev) => [...prev, ...next])
    if (typeof count === 'number') setTotalCount(count)
    const totalNow = typeof count === 'number' ? count : totalCount
    setHasMore(offset + next.length < totalNow)
    setLoadingMore(false)
  }, [loadingMore, hasMore, currentCompany, rows.length, buildVoucherQuery, totalCount])

  // Refresh til ekstern brug (fx efter upload). Sætter triggeret state der re-fyrer effekten.
  // Henter første side igen — bruges efter upload mv. hvor deps ikke ændres.
  const refresh = useCallback(() => {
    if (!currentCompany) return
    void (async () => {
      setLoading(true)
      const query = buildVoucherQuery(0, VOUCHER_PAGE_SIZE)
      if (!query) {
        setLoading(false)
        return
      }
      const { data, count, error: err } = await query
      if (err) setError(err.message)
      const list = data ?? []
      setRows(list)
      setTotalCount(count ?? 0)
      setHasMore(list.length < (count ?? 0))
      setLoading(false)
    })()
  }, [buildVoucherQuery, currentCompany])

  // IntersectionObserver: hent næste side når brugeren scroller bunden af listen i syne.
  useEffect(() => {
    const node = loadMoreSentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreVouchers()
      },
      { rootMargin: '300px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMoreVouchers])

  // Luk "Tilføj bilag"-menuen ved klik udenfor / ESC.
  useEffect(() => {
    if (!addOpen) return
    function onClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAddOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [addOpen])

  const voucherHighlight = searchParams.get('voucher')
  useEffect(() => {
    if (!voucherHighlight || loading) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(`voucher-row-${voucherHighlight}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'transition-shadow')
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2')
        }, 2200)
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('voucher')
          return next
        },
        { replace: true },
      )
    }, 80)
    return () => window.clearTimeout(t)
  }, [voucherHighlight, loading, setSearchParams])

  const reimbursementByVoucherId = useMemo(() => {
    return new Map(reimbursements.map((r) => [r.voucher_id, r]))
  }, [reimbursements])

  // Server-side search/filter/sort: rækkerne i `rows` er allerede filtreret + sorteret.
  // Vi bevarer client-side `voucherTotals` over indlæste rækker; viser "X af Y" hvis flere venter.
  const voucherTotals = useMemo(() => {
    return rows.reduce(
      (acc, v) => ({
        gross: acc.gross + Number(v.gross_cents ?? 0),
        vat: acc.vat + Number(v.vat_cents ?? 0),
        net: acc.net + Number(v.net_cents ?? 0),
      }),
      { gross: 0, vat: 0, net: 0 },
    )
  }, [rows])

  const projectTotals = useMemo(() => {
    return projects
      .map((project) => {
        const list = rows.filter((v) => v.voucher_project_id === project.id)
        const gross = list.reduce((sum, v) => sum + Number(v.gross_cents ?? 0), 0)
        return { project, count: list.length, gross }
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 6)
  }, [projects, rows])

  function onSortColumn(col: VoucherSortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as VoucherSortKey | null)
    setSortDir(next.dir)
  }

  async function uploadVoucherFile(file: File) {
    if (!currentCompany || !user) return
    setUploading(true)
    setError(null)
    setOcrWarning(null)
    setOcrProgress(null)

    const canOcr = canAttemptVoucherOcr(file)

    let titleForDb = file.name.replace(/\.[^.]+$/, '')
    let expenseDateForDb = todayIso()
    let grossKrForDb = ''
    let vatRateForDb = '25'
    let notesForDb: string | null = null
    let categoryForDb: string | null = inferVoucherCategory(file.name)

    if (canOcr) {
      try {
        const parsed = await extractVoucherFromFile(file, (p) => setOcrProgress(p))
        notesForDb = formatParsedNotes(parsed)
        titleForDb = parsed.merchantGuess ?? titleForDb
        categoryForDb =
          inferVoucherCategory(
            [parsed.merchantGuess, parsed.rawSnippet, parsed.lineItems.join(' '), file.name]
              .filter(Boolean)
              .join(' '),
          ) ?? categoryForDb
        if (parsed.expenseDateIso) {
          expenseDateForDb = parsed.expenseDateIso
        }
        if (parsed.totalKr != null && parsed.totalKr > 0) {
          grossKrForDb = parsed.totalKr.toFixed(2).replace('.', ',')
        } else {
          setOcrWarning(
            'Beløbet kunne ikke aflæses automatisk. Bilaget er uploadet — klik på det i listen og indtast beløbet manuelt.',
          )
        }
        if (parsed.vatRateGuess !== null && parsed.vatRateGuess >= 0 && parsed.vatRateGuess <= 100) {
          vatRateForDb = String(parsed.vatRateGuess)
        }
      } catch (e) {
        console.warn('[bilag extract]', e)
        setOcrWarning(
          'Kunne ikke læse bilaget automatisk — det er uploadet; du kan tjekke beløb i listen eller bruge «Scan bilag» til kamera. HEIC: eksporter som JPEG hvis nødvendigt.',
        )
      }
    }

    setOcrProgress(null)

    const grossCents = Math.max(
      0,
      Math.round((parseFloat(grossKrForDb.replace(',', '.')) || 0) * 100),
    )
    const rate = Math.max(
      0,
      Math.min(100, parseFloat(vatRateForDb.replace(',', '.')) || 0),
    )
    const netCents = rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents
    const vatCents = Math.max(0, grossCents - netCents)

    const path = `${currentCompany.id}/${crypto.randomUUID()}-${file.name}`
    const { error: upErr } = await supabase.storage
      .from('vouchers')
      .upload(path, file, { upsert: false })
    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const voucherInsert: Database['public']['Tables']['vouchers']['Insert'] = {
      company_id: currentCompany.id,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      title: titleForDb,
      category: categoryForDb,
      notes: notesForDb,
      uploaded_by: user.id,
      expense_date: expenseDateForDb,
      gross_cents: grossCents,
      net_cents: netCents,
      vat_cents: vatCents,
      vat_rate: rate,
    }
    if (!projectFeatureUnavailable) {
      voucherInsert.voucher_project_id = null
    }
    const { data: inserted, error: dbErr } = await supabase
      .from('vouchers')
      .insert(voucherInsert)
      .select('id')
      .single()
    if (dbErr) {
      setError(dbErr.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    await logActivity(currentCompany.id, 'voucher_upload', `Bilag uploadet: ${file.name}`, {
      voucher_id: inserted.id,
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
    refresh()
  }

  async function createProject() {
    if (!currentCompany || !user) return
    if (!canUseVoucherProjects) return
    const name = newProjectName.trim()
    if (!name) return
    setCreatingProject(true)
    setError(null)
    const { data, error: projectErr } = await supabase
      .from('voucher_projects')
      .insert({
        company_id: currentCompany.id,
        name,
        created_by: user.id,
      })
      .select('*')
      .single()
    setCreatingProject(false)
    if (projectErr || !data) {
      if (isVoucherProjectSchemaError(projectErr)) {
        setProjectFeatureUnavailable(true)
        setError(
          'Event/projekt er ikke aktiveret i databasen endnu. Kør den nye Supabase migration og genindlæs siden.',
        )
      } else {
        setError(projectErr?.message ?? 'Kunne ikke oprette event/projekt')
      }
      return
    }
    setProjectFeatureUnavailable(false)
    setProjects((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'da')))
    setProjectFilter(data.id)
    setProjectCreateOpen(false)
    setNewProjectName('')
  }

  async function createExpenseUploadLink() {
    if (!currentCompany || !user) return
    if (!canUseExpenseLinks) {
      setError('Udlægslink er ikke aktivt i den nuværende plan.')
      return
    }
    setCreatingExpenseLink(true)
    setError(null)
    setExpenseLink(null)
    try {
      const token = randomExpenseLinkToken()
      const { error: linkErr } = await supabase
        .from('expense_upload_links')
        .insert({
          company_id: currentCompany.id,
          token_hash: await sha256Hex(token),
          mode: expenseLinkMode,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          max_uploads: expenseLinkMode === 'single_use' ? 1 : null,
          created_by: user.id,
        })
      if (linkErr) throw linkErr
      setExpenseLink(expenseLinkUrl(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke oprette udlægslink.')
    } finally {
      setCreatingExpenseLink(false)
    }
  }

  async function copyExpenseLink() {
    if (!expenseLink) return
    await navigator.clipboard?.writeText(expenseLink)
    setExpenseLinkCopied(true)
  }

  async function updateReimbursementStatus(reimbursement: Reimbursement, status: ReimbursementStatus) {
    const previous = reimbursements
    setReimbursements((prev) =>
      prev.map((row) => (row.id === reimbursement.id ? { ...row, status } : row)),
    )
    const { error: statusErr } = await supabase
      .from('voucher_reimbursements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reimbursement.id)
    if (statusErr) {
      setReimbursements(previous)
      setError(statusErr.message)
    }
  }

  async function updateVoucherDetails(
    v: Voucher,
    updates: Partial<VoucherEditableFields>,
  ) {
    if (!currentCompany) throw new Error('Ingen virksomhed valgt')
    const { error: updateErr } = await supabase
      .from('vouchers')
      .update(updates)
      .eq('id', v.id)
      .eq('company_id', currentCompany.id)
    if (updateErr) throw new Error(updateErr.message)
    setRows((prev) => prev.map((row) => (row.id === v.id ? { ...row, ...updates } : row)))
    setPreview((prev) =>
      prev && prev.voucher.id === v.id
        ? { ...prev, voucher: { ...prev.voucher, ...updates } }
        : prev,
    )
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadVoucherFile(file)
  }

  function onPageDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (uploading) return
    if (!e.dataTransfer.types.includes('Files')) return
    setDragActive(true)
  }

  function onPageDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onOverlayDragEnter(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current += 1
  }

  function onOverlayDragLeave(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current -= 1
    if (overlayDragDepthRef.current <= 0) {
      overlayDragDepthRef.current = 0
      setDragActive(false)
    }
  }

  function onOverlayDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onOverlayDrop(e: React.DragEvent) {
    e.preventDefault()
    overlayDragDepthRef.current = 0
    setDragActive(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadVoucherFile(file)
  }

  /**
   * Åbner fil i ny fane. Brug ikke «about:blank» + sæt location efter `await` — flere
   * browsere blokerer så navigation (tab forbliver tom).
   */
  async function deleteVoucher(v: Voucher) {
    if (!currentCompany || !canDeleteVoucher) return
    const name = (v.title?.trim() || v.filename || 'dette bilag').slice(0, 200)
    if (
      !window.confirm(
        `Vil du slette bilag «${name}»?\n\nFilen og alle registrerede beløb fjernes permanent. Dette kan ikke fortrydes.`,
      )
    ) {
      return
    }
    setDeletingId(v.id)
    setError(null)
    try {
      const { error: rmErr } = await supabase.storage.from('vouchers').remove([v.storage_path])
      if (rmErr) {
        console.warn('[vouchers] storage remove:', rmErr.message)
      }
      const { error: delErr } = await supabase
        .from('vouchers')
        .delete()
        .eq('id', v.id)
        .eq('company_id', currentCompany.id)
      if (delErr) {
        setError(delErr.message)
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== v.id))
      await logActivity(currentCompany.id, 'voucher_delete', `Bilag slettet: ${name}`, {
        voucher_id: v.id,
      })
    } finally {
      setDeletingId(null)
    }
  }

  async function openSigned(v: Voucher) {
    setError(null)
    try {
      const { data, error: err } = await supabase.storage
        .from('vouchers')
        .createSignedUrl(v.storage_path, 3600)
      if (err || !data?.signedUrl) {
        setError(err?.message ?? 'Kunne ikke åbne fil')
        return
      }
      setPreview({ voucher: v, url: data.signedUrl })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke åbne fil')
    }
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Vælg virksomhed.</p>
  }

  return (
    <div className="relative min-h-[60vh]" onDragEnter={onPageDragEnter} onDragOver={onPageDragOver}>
      {dragActive ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-indigo-600/20 backdrop-blur-[2px]"
          onDragEnter={onOverlayDragEnter}
          onDragLeave={onOverlayDragLeave}
          onDragOver={onOverlayDragOver}
          onDrop={onOverlayDrop}
          aria-live="polite"
          role="presentation"
        >
          <div className="pointer-events-none mx-4 max-w-lg rounded-2xl border-4 border-dashed border-indigo-500 bg-white/95 px-8 py-10 text-center shadow-2xl">
            <p className="text-lg font-semibold text-indigo-900">Slip filen her</p>
            <p className="mt-2 text-sm text-slate-600">
              Filen uploades; beløb og dato gættes automatisk når det er muligt.
            </p>
          </div>
        </div>
      ) : null}

      <AppPageLayout maxWidth="full" className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">Bilag</h1>
          <p className="text-sm text-slate-600">
            Scan med kamera, upload en fil, eller træk filer ind et vilkårligt sted på siden.
          </p>
        </div>
        <div ref={addMenuRef} className="relative shrink-0">
          <button
            type="button"
            disabled={uploading}
            onClick={() => setAddOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <ButtonSpinner /> : null}
            {uploading
              ? ocrProgress != null
                ? `Læser… ${ocrProgress}%`
                : 'Uploader…'
              : 'Tilføj bilag'}
            {!uploading ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            ) : null}
          </button>
          {addOpen && !uploading ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <Link
                to="/app/vouchers/scan"
                role="menuitem"
                onClick={() => setAddOpen(false)}
                className="flex min-h-[48px] items-center px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                Scan bilag
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddOpen(false)
                  fileInputRef.current?.click()
                }}
                className="flex min-h-[48px] w-full items-center px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                Upload bilag
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canUseExpenseLinks}
                onClick={() => {
                  setAddOpen(false)
                  setExpenseLink(null)
                  setExpenseLinkCopied(false)
                  setExpenseLinkMode('single_use')
                  setExpenseLinkModalOpen(true)
                }}
                title={!canUseExpenseLinks ? 'Udlægslink er ikke aktivt i den nuværende plan' : undefined}
                className="flex min-h-[48px] w-full items-center px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Udlægslink
              </button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void onFile(e)}
          />
        </div>
      </div>

      {ocrWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ocrWarning}
        </p>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søg efter titel, fil, kategori, event, beløb, dato …"
            className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 md:flex-1"
            autoComplete="off"
          />
          <label className="min-w-0 md:w-64 md:shrink-0">
            <span className="sr-only">Filtrer på event/projekt</span>
            <select
              value={projectFilter}
              disabled={projectFeatureUnavailable || !canUseVoucherProjects}
              onChange={(e) => {
                const value = e.target.value
                if (value === '__create__') {
                  setProjectCreateOpen(true)
                  return
                }
                setProjectFilter(value)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="all">Alle bilag</option>
              <option value="none">Uden event/projekt</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              {canUseVoucherProjects && !projectFeatureUnavailable ? (
                <option value="__create__">+ Opret nyt event…</option>
              ) : null}
            </select>
          </label>
          <DesktopListCardsToggle mode={desktopView} onChange={setDesktopView} />
        </div>

        {projectCreateOpen ? (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Navn på nyt event/projekt
              </span>
              <button
                type="button"
                aria-label="Annullér"
                onClick={() => {
                  setProjectCreateOpen(false)
                  setNewProjectName('')
                }}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-200"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Sommerlejr 2026"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
              <button
                type="button"
                disabled={creatingProject || !newProjectName.trim()}
                onClick={() => void createProject()}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creatingProject ? 'Opretter…' : 'Opret'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            {hasMore ? `${rows.length} af ${totalCount} bilag` : `${totalCount} bilag`}
          </span>
          <span
            className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
            title={hasMore ? 'Sum opdateres efterhånden som du scroller' : undefined}
          >
            {formatDkk(voucherTotals.gross)}
            {hasMore ? '+' : ''}
          </span>
          {!isForening ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              Moms {formatDkk(voucherTotals.vat)}{hasMore ? '+' : ''}
            </span>
          ) : null}
          {projectTotals.length > 0 ? (
            <button
              type="button"
              onClick={() => setProjectOverviewOpen((open) => !open)}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Event-overblik
            </button>
          ) : null}
        </div>
      </div>

      {projectFeatureUnavailable ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Event/projekt kræver en databaseopdatering. Kør migrationen
          <span className="font-mono"> 20260424170000_voucher_projects.sql</span> og genindlæs siden.
        </p>
      ) : null}

      {featureGateKnown && !canUseVoucherProjects ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Events/projekter kræver Pro</p>
              <p className="mt-0.5 text-indigo-900/80">
                Du kan stadig bruge bilag og kategorier. Opgradér for at gruppere bilag på tværs af events og projekter.
              </p>
            </div>
            <button
              type="button"
              disabled={checkout.loading}
              onClick={() => void checkout.launch(currentCompany.id)}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
            >
              {checkout.loading ? <ButtonSpinner /> : null}
              {checkout.loading ? 'Åbner Stripe…' : 'Opgradér'}
            </button>
          </div>
        </div>
      ) : null}

      {projectTotals.length > 0 && projectOverviewOpen ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Største events/projekter</h3>
            <span className="text-xs text-slate-500">Baseret på alle bilag</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {projectTotals.map(({ project, count, gross }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setProjectFilter(project.id)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:border-indigo-200 hover:bg-indigo-50/60"
              >
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {project.name}
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  {formatDkk(gross)} · {count} bilag
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={`grid grid-cols-1 gap-3 ${desktopView === 'list' ? 'md:hidden' : 'md:grid-cols-2 lg:grid-cols-3'}`}
      >
        {loading ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Indlæser…
          </p>
        ) : rows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            {debouncedSearch || projectFilter !== 'all'
              ? 'Ingen bilag matcher søgningen.'
              : 'Ingen bilag endnu.'}
          </p>
        ) : (
          rows.map((v) => {
            const dateStr = v.expense_date
              ? formatDateOnly(v.expense_date)
              : formatDateOnly(v.uploaded_at)
            const reimbursement = reimbursementByVoucherId.get(v.id)
            return (
              <div
                key={v.id}
                id={`voucher-row-${v.id}`}
                role="button"
                tabIndex={0}
                onClick={() => openSigned(v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openSigned(v)
                  }
                }}
                className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                {isForening ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-slate-500">
                        {dateStr}
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {v.category ?? 'Uden kategori'}
                        </span>
                        {v.voucher_project_id ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            {projects.find((p) => p.id === v.voucher_project_id)?.name ?? 'Event/projekt'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium text-slate-800">{v.title ?? '—'}</p>
                      {v.gross_cents ? (
                        <span className="shrink-0 text-sm font-semibold text-slate-900">
                          {formatDkk(v.gross_cents)}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Indtast beløb
                        </span>
                      )}
                    </div>
                    {reimbursement ? (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                        <div className="font-semibold">Udlæg: {reimbursement.requester_name}</div>
                        {reimbursement.status === 'refunded' ? (
                          <span className="mt-2 inline-flex rounded-full bg-emerald-200/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                            {reimbursementStatusLabels.refunded}
                          </span>
                        ) : (
                          <select
                            value={reimbursement.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation()
                              void updateReimbursementStatus(reimbursement, e.target.value as ReimbursementStatus)
                            }}
                            className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {Object.entries(reimbursementStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                        {reimbursement.status !== 'refunded' ? (
                          <div className="mt-1 text-emerald-900/80">
                            {reimbursement.bank_reg_number || reimbursement.bank_account_number
                              ? `Reg. ${reimbursement.bank_reg_number ?? '—'} / Konto ${reimbursement.bank_account_number ?? '—'}`
                              : 'Ingen konto angivet'}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <span className="text-sm font-medium text-indigo-600">Åbn bilag →</span>
                      {canDeleteVoucher ? (
                        <button
                          type="button"
                          aria-label={deletingId === v.id ? 'Sletter…' : 'Slet bilag'}
                          disabled={deletingId === v.id}
                          className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteVoucher(v)
                          }}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {dateStr}
                      </span>
                      {v.gross_cents ? (
                        <span className="text-sm font-semibold text-slate-900">
                          {formatDkk(v.gross_cents)}
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Indtast beløb
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-slate-800">{v.title ?? '—'}</p>
                    {reimbursement ? (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                        <div className="font-semibold">Udlæg: {reimbursement.requester_name}</div>
                        {reimbursement.status === 'refunded' ? (
                          <span className="mt-2 inline-flex rounded-full bg-emerald-200/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                            {reimbursementStatusLabels.refunded}
                          </span>
                        ) : (
                          <select
                            value={reimbursement.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation()
                              void updateReimbursementStatus(reimbursement, e.target.value as ReimbursementStatus)
                            }}
                            className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {Object.entries(reimbursementStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                        {reimbursement.status !== 'refunded' ? (
                          <div className="mt-1 text-emerald-900/80">
                            {reimbursement.bank_reg_number || reimbursement.bank_account_number
                              ? `Reg. ${reimbursement.bank_reg_number ?? '—'} / Konto ${reimbursement.bank_account_number ?? '—'}`
                              : 'Ingen konto angivet'}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {v.category ?? 'Uden kategori'}
                      </span>
                      {v.voucher_project_id ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {projects.find((p) => p.id === v.voucher_project_id)?.name ?? 'Event/projekt'}
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        {v.vat_cents ? `Moms ${formatDkk(v.vat_cents)}` : 'Moms —'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-indigo-600">Åbn bilag →</span>
                      {canDeleteVoucher ? (
                        <button
                          type="button"
                          disabled={deletingId === v.id}
                          className="min-h-[44px] rounded-lg px-2 text-sm font-medium text-rose-700 hover:bg-rose-50 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteVoucher(v)
                          }}
                        >
                          {deletingId === v.id ? 'Sletter…' : 'Slet'}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${desktopView === 'list' ? 'hidden md:block' : 'hidden'}`}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <SortableTh
                label="Dato"
                isActive={sortKey === 'date'}
                direction={sortKey === 'date' ? sortDir : null}
                onClick={() => onSortColumn('date')}
              />
              <SortableTh
                label="Titel"
                isActive={sortKey === 'title'}
                direction={sortKey === 'title' ? sortDir : null}
                onClick={() => onSortColumn('title')}
              />
              <SortableTh
                label="Kategori"
                isActive={sortKey === 'category'}
                direction={sortKey === 'category' ? sortDir : null}
                onClick={() => onSortColumn('category')}
              />
              <SortableTh
                label="Event/projekt"
                isActive={sortKey === 'project'}
                direction={sortKey === 'project' ? sortDir : null}
                onClick={() => onSortColumn('project')}
              />
              <th className="px-4 py-3">Udlæg</th>
              <SortableTh
                label="Beløb"
                isActive={sortKey === 'gross'}
                direction={sortKey === 'gross' ? sortDir : null}
                onClick={() => onSortColumn('gross')}
                align="right"
              />
              {!isForening ? (
                <SortableTh
                  label="Moms"
                  isActive={sortKey === 'vat'}
                  direction={sortKey === 'vat' ? sortDir : null}
                  onClick={() => onSortColumn('vat')}
                  align="right"
                />
              ) : null}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isForening ? 7 : 8} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={isForening ? 7 : 8} className="px-4 py-8 text-center text-slate-500">
                  {debouncedSearch || projectFilter !== 'all'
                    ? 'Ingen bilag matcher søgningen.'
                    : 'Ingen bilag endnu.'}
                </td>
              </tr>
            ) : (
              rows.map((v) => {
                const reimbursement = reimbursementByVoucherId.get(v.id)
                return (
                <tr
                  key={v.id}
                  id={`voucher-row-${v.id}`}
                  onClick={() => openSigned(v)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-indigo-50/40"
                >
                  <td className="px-4 py-3 text-slate-600">
                    {v.expense_date
                      ? formatDateOnly(v.expense_date)
                      : formatDateOnly(v.uploaded_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{v.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {v.category ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {v.category}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Uden kategori</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {v.voucher_project_id ? (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {projects.find((p) => p.id === v.voucher_project_id)?.name ?? '—'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {reimbursement ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-900">
                          {reimbursement.requester_name}
                        </div>
                        {reimbursement.status !== 'refunded' ? (
                          <div className="text-xs text-slate-600">
                            {reimbursement.bank_reg_number || reimbursement.bank_account_number
                              ? `Reg. ${reimbursement.bank_reg_number ?? '—'} / Konto ${reimbursement.bank_account_number ?? '—'}`
                              : 'Ingen konto angivet'}
                          </div>
                        ) : null}
                        {reimbursement.status === 'refunded' ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {reimbursementStatusLabels.refunded}
                          </span>
                        ) : (
                          <select
                            value={reimbursement.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation()
                              void updateReimbursementStatus(
                                reimbursement,
                                e.target.value as ReimbursementStatus,
                              )
                            }}
                            className="w-full min-w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {Object.entries(reimbursementStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {v.gross_cents ? (
                      formatDkk(v.gross_cents)
                    ) : (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Indtast beløb
                      </span>
                    )}
                  </td>
                  {!isForening ? (
                    <td className="px-4 py-3 text-right text-slate-600">
                      {v.vat_cents ? formatDkk(v.vat_cents) : '—'}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-600 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          void openSigned(v)
                        }}
                      >
                        Åbn
                      </button>
                      {canDeleteVoucher ? (
                        <button
                          type="button"
                          disabled={deletingId === v.id}
                          className="text-sm font-medium text-rose-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteVoucher(v)
                          }}
                        >
                          {deletingId === v.id ? 'Sletter…' : 'Slet'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && rows.length > 0 ? (
        <div
          ref={loadMoreSentinelRef}
          className="flex items-center justify-center py-4 text-xs text-slate-500"
        >
          {hasMore ? (loadingMore ? 'Indlæser flere…' : 'Scroll for at hente flere') : 'Ingen flere bilag.'}
        </div>
      ) : null}
      {preview ? (
        <VoucherPreviewModal
          voucher={preview.voucher}
          url={preview.url}
          canEdit={canDeleteVoucher}
          showVat={!isForening}
          projects={projects}
          canUseVoucherProjects={canUseVoucherProjects && !projectFeatureUnavailable}
          reimbursement={reimbursementByVoucherId.get(preview.voucher.id) ?? null}
          onUpdateReimbursementStatus={updateReimbursementStatus}
          onClose={() => setPreview(null)}
          onSave={(updates) => updateVoucherDetails(preview.voucher, updates)}
        />
      ) : null}
      {expenseLinkModalOpen ? (
        <div
          role="dialog"
          aria-modal
          onClick={() => setExpenseLinkModalOpen(false)}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Opret udlægslink</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Vælg hvor længe linket skal virke. Modtageren kan uploade bilag uden konto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpenseLinkModalOpen(false)}
                aria-label="Luk"
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {([
                { value: 'single_use', label: '1 upload', sub: 'Linket kan kun bruges én gang' },
                { value: 'time_window', label: '1 time', sub: 'Ubegrænset uploads i 1 time' },
              ] as Array<{ value: ExpenseLinkMode; label: string; sub: string }>).map((opt) => {
                const active = expenseLinkMode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpenseLinkMode(opt.value)}
                    className={
                      'flex flex-col items-start rounded-xl border p-3 text-left transition ' +
                      (active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300')
                    }
                  >
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="mt-1 text-xs text-slate-500">{opt.sub}</span>
                  </button>
                )
              })}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            ) : null}

            {expenseLink ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-950">Udlægslink klar</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    readOnly
                    value={expenseLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => void copyExpenseLink()}
                    className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    {expenseLinkCopied ? 'Kopieret' : 'Kopiér'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpenseLinkModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {expenseLink ? 'Luk' : 'Annuller'}
              </button>
              {!expenseLink ? (
                <button
                  type="button"
                  disabled={creatingExpenseLink || !canUseExpenseLinks}
                  onClick={() => {
                    setExpenseLinkCopied(false)
                    void createExpenseUploadLink()
                  }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                >
                  {creatingExpenseLink ? 'Opretter…' : 'Opret link'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </AppPageLayout>
    </div>
  )
}

type VoucherEditableFields = Pick<
  Voucher,
  | 'title'
  | 'expense_date'
  | 'gross_cents'
  | 'vat_cents'
  | 'net_cents'
  | 'vat_rate'
  | 'category'
  | 'voucher_project_id'
>

function centsToKrInput(cents: number): string {
  if (!cents) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

function parseKrToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return 0
  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function VoucherPreviewModal({
  voucher,
  url,
  canEdit,
  showVat,
  projects,
  canUseVoucherProjects,
  reimbursement,
  onUpdateReimbursementStatus,
  onClose,
  onSave,
}: {
  voucher: Voucher
  url: string
  canEdit: boolean
  showVat: boolean
  projects: VoucherProject[]
  canUseVoucherProjects: boolean
  reimbursement: Reimbursement | null
  onUpdateReimbursementStatus: (reimbursement: Reimbursement, status: ReimbursementStatus) => Promise<void>
  onClose: () => void
  onSave: (updates: Partial<VoucherEditableFields>) => Promise<void>
}) {
  const [title, setTitle] = useState(voucher.title ?? '')
  const [date, setDate] = useState(voucher.expense_date)
  const [grossKr, setGrossKr] = useState(centsToKrInput(voucher.gross_cents))
  const [vatKr, setVatKr] = useState(centsToKrInput(voucher.vat_cents))
  const [category, setCategory] = useState<string>(voucher.category ?? '')
  const [projectId, setProjectId] = useState<string>(voucher.voucher_project_id ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setTitle(voucher.title ?? '')
    setDate(voucher.expense_date)
    setGrossKr(centsToKrInput(voucher.gross_cents))
    setVatKr(centsToKrInput(voucher.vat_cents))
    setCategory(voucher.category ?? '')
    setProjectId(voucher.voucher_project_id ?? '')
    setFormError(null)
  }, [
    voucher.id,
    voucher.title,
    voucher.expense_date,
    voucher.gross_cents,
    voucher.vat_cents,
    voucher.category,
    voucher.voucher_project_id,
  ])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mime = voucher.mime_type ?? ''
  const isImage =
    mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(voucher.storage_path)

  async function handleSave() {
    setFormError(null)
    if (!date) {
      setFormError('Dato mangler')
      return
    }
    const grossCents = parseKrToCents(grossKr)
    if (grossCents === null) {
      setFormError('Beløb er ugyldigt')
      return
    }
    let vatCents = 0
    if (showVat) {
      const parsed = parseKrToCents(vatKr)
      if (parsed === null) {
        setFormError('Moms er ugyldig')
        return
      }
      if (parsed > grossCents) {
        setFormError('Moms kan ikke være højere end beløbet')
        return
      }
      vatCents = parsed
    }
    const netCents = grossCents - vatCents
    const vatRate = netCents > 0 ? Math.round((vatCents / netCents) * 10000) / 100 : 0
    setSaving(true)
    try {
      await onSave({
        title: title.trim() ? title.trim() : null,
        expense_date: date,
        gross_cents: grossCents,
        vat_cents: vatCents,
        net_cents: netCents,
        vat_rate: vatRate,
        category: category || null,
        voucher_project_id: canUseVoucherProjects ? (projectId || null) : voucher.voucher_project_id,
      })
      onClose()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Kunne ikke gemme')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="truncate text-base font-semibold text-slate-900">
            {voucher.title ?? 'Bilag'}
          </h2>
          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Åbn i ny fane
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Luk forhåndsvisning"
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </header>
        {canEdit ? (
          <section className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                Titel
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="Fx Cafébesøg"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Dato
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Beløb (kr)
                <input
                  type="text"
                  inputMode="decimal"
                  value={grossKr}
                  onChange={(e) => setGrossKr(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="0,00"
                />
              </label>
              {showVat ? (
                <label className="block text-xs font-medium text-slate-600">
                  Moms (kr)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vatKr}
                    onChange={(e) => setVatKr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder="0,00"
                  />
                </label>
              ) : null}
              <label className="block text-xs font-medium text-slate-600">
                Kategori
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Uden kategori</option>
                  {VOUCHER_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {canUseVoucherProjects ? (
                <label className="block text-xs font-medium text-slate-600">
                  Event/projekt
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">Uden event/projekt</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {reimbursement ? (
                <label className="block text-xs font-medium text-slate-600">
                  Udlæg-status
                  <select
                    value={reimbursement.status}
                    onChange={(e) =>
                      void onUpdateReimbursementStatus(reimbursement, e.target.value as ReimbursementStatus)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {Object.entries(reimbursementStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              {formError ? (
                <span className="text-xs font-medium text-rose-700">{formError}</span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Gemmer…' : 'Gem ændringer'}
              </button>
            </div>
          </section>
        ) : null}
        <div className="flex-1 overflow-auto bg-slate-100">
          {isImage ? (
            <img
              src={url}
              alt={voucher.title ?? 'Bilag'}
              className="mx-auto block max-h-[80vh] object-contain"
            />
          ) : (
            <InvoicePdfCanvasViewer pdfUrl={url} title={voucher.title ?? 'Bilag'} />
          )}
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { DesktopListCardsToggle } from '@/components/DesktopListCardsToggle'
import { useDesktopListViewPreference } from '@/hooks/useDesktopListViewPreference'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { formatDateOnly, formatDkk } from '@/lib/format'
import { formatParsedNotes, parseDanishReceiptText } from '@/lib/receiptParse'
import { canAttemptVoucherOcr, ocrImageOrPdfFile } from '@/lib/voucherOcr'
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

function voucherLedgerDate(v: Voucher): string {
  return v.expense_date ?? v.uploaded_at.slice(0, 10)
}

function sortVouchers(
  list: Voucher[],
  key: VoucherSortKey,
  dir: ColumnSortDir,
  projectNameForVoucher: (v: Voucher) => string,
): Voucher[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'date':
        return (
          mul *
          String(voucherLedgerDate(a)).localeCompare(String(voucherLedgerDate(b))) ||
          String(a.uploaded_at).localeCompare(String(b.uploaded_at))
        )
      case 'title':
        return mul * String(a.title ?? '').localeCompare(String(b.title ?? ''), 'da', { sensitivity: 'base' })
      case 'category':
        return mul * String(a.category ?? '').localeCompare(String(b.category ?? ''), 'da', { sensitivity: 'base' })
      case 'project':
        return mul * projectNameForVoucher(a).localeCompare(projectNameForVoucher(b), 'da', { sensitivity: 'base' })
      case 'gross':
        return mul * ((a.gross_cents ?? 0) - (b.gross_cents ?? 0))
      case 'vat':
        return mul * ((a.vat_cents ?? 0) - (b.vat_cents ?? 0))
      default:
        return 0
    }
  })
}

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

export function VouchersPage() {
  const { currentCompany, user, currentRole, billingEntitlements, canUse } = useApp()
  const checkout = useStripeCheckoutLauncher()
  const [searchParams, setSearchParams] = useSearchParams()
  const [desktopView, setDesktopView] = useDesktopListViewPreference(VOUCHERS_VIEW_KEY, 'list')
  const [rows, setRows] = useState<Voucher[]>([])
  const [projects, setProjects] = useState<VoucherProject[]>([])
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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
  const [sortKey, setSortKey] = useState<VoucherSortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assigningCategoryId, setAssigningCategoryId] = useState<string | null>(null)
  const [assigningVoucherId, setAssigningVoucherId] = useState<string | null>(null)
  const [expenseLinkMode, setExpenseLinkMode] = useState<ExpenseLinkMode>('single_use')
  const [creatingExpenseLink, setCreatingExpenseLink] = useState(false)
  const [expenseLink, setExpenseLink] = useState<string | null>(null)
  const [projectOverviewOpen, setProjectOverviewOpen] = useState(false)

  const canDeleteVoucher = canWriterDeleteVouchers(currentRole)
  const featureGateKnown = billingEntitlements.length > 0
  const canUseVoucherProjects = !featureGateKnown || canUse('voucher_projects')
  const canUseExpenseLinks = !featureGateKnown || canUse('expense_links')

  const load = useCallback(async function load() {
    if (!currentCompany) return
    setLoading(true)
    setError(null)
    const [voucherRes, projectRes, reimbursementRes] = await Promise.all([
      supabase
      .from('vouchers')
      .select('*')
      .eq('company_id', currentCompany.id)
        .order('uploaded_at', { ascending: false }),
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
    if (voucherRes.error) {
      setError(voucherRes.error.message)
    }
    setRows(voucherRes.data ?? [])
    setReimbursements(reimbursementRes.data ?? [])
    if (isVoucherProjectSchemaError(projectRes.error)) {
      setProjectFeatureUnavailable(true)
      setProjects([])
    } else {
      setProjectFeatureUnavailable(false)
      setProjects(projectRes.data ?? [])
    }
    setLoading(false)
  }, [currentCompany])

  useEffect(() => {
    void load()
  }, [load])

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

  const projectById = useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  const reimbursementByVoucherId = useMemo(() => {
    return new Map(reimbursements.map((r) => [r.voucher_id, r]))
  }, [reimbursements])

  const projectNameForVoucher = useCallback(function projectNameForVoucher(v: Voucher) {
    return v.voucher_project_id ? (projectById.get(v.voucher_project_id)?.name ?? '') : ''
  }, [projectById])

  const searchMatched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    const tokens = q.split(/\s+/).filter(Boolean)
    return rows.filter((v) => {
      const dateStr = v.expense_date
        ? formatDateOnly(v.expense_date)
        : formatDateOnly(v.uploaded_at)
      const grossStr = v.gross_cents ? formatDkk(v.gross_cents) : ''
      const vatStr = v.vat_cents ? formatDkk(v.vat_cents) : ''
      const projectStr = projectNameForVoucher(v)
      const hay = [
        v.title ?? '',
        v.filename ?? '',
        v.category ?? '',
        projectStr,
        v.notes ?? '',
        dateStr,
        grossStr,
        vatStr,
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every((t) => hay.includes(t))
    })
  }, [rows, searchQuery, projectNameForVoucher])

  const filteredRows = useMemo(() => {
    const projectMatched = searchMatched.filter((v) => {
      if (projectFilter === 'all') return true
      if (projectFilter === 'none') return !v.voucher_project_id
      return v.voucher_project_id === projectFilter
    })
    if (sortKey === null) return projectMatched
    return sortVouchers(projectMatched, sortKey, sortDir, projectNameForVoucher)
  }, [searchMatched, projectFilter, sortKey, sortDir, projectNameForVoucher])

  const voucherTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, v) => ({
        gross: acc.gross + Number(v.gross_cents ?? 0),
        vat: acc.vat + Number(v.vat_cents ?? 0),
        net: acc.net + Number(v.net_cents ?? 0),
      }),
      { gross: 0, vat: 0, net: 0 },
    )
  }, [filteredRows])

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
        const text = await ocrImageOrPdfFile(file, (p) => setOcrProgress(p))
        const parsed = parseDanishReceiptText(text)
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
        if (parsed.totalKr != null) {
          grossKrForDb = parsed.totalKr.toFixed(2).replace('.', ',')
        }
        if (parsed.vatRateGuess !== null) {
          vatRateForDb = String(parsed.vatRateGuess)
        }
      } catch (e) {
        console.warn('[bilag OCR]', e)
        setOcrWarning(
          'Kunne ikke læse bilaget automatisk — det er uploadet; du kan tjekke beløb i listen eller bruge «Scan bilag» til kamera. HEIC: eksporter som JPEG hvis nødvendigt.',
        )
      }
    }

    setOcrProgress(null)

    const grossCents = Math.round(
      (parseFloat(grossKrForDb.replace(',', '.')) || 0) * 100,
    )
    const rate = parseFloat(vatRateForDb.replace(',', '.')) || 0
    const netCents = rate > 0 ? Math.round(grossCents / (1 + rate / 100)) : grossCents
    const vatCents = grossCents - netCents

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
    await load()
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

  async function updateVoucherProject(v: Voucher, projectId: string | null) {
    if (!currentCompany) return
    if (!canUseVoucherProjects) return
    setAssigningVoucherId(v.id)
    setError(null)
    const { error: updateErr } = await supabase
      .from('vouchers')
      .update({ voucher_project_id: projectId })
      .eq('id', v.id)
      .eq('company_id', currentCompany.id)
    setAssigningVoucherId(null)
    if (updateErr) {
      if (isVoucherProjectSchemaError(updateErr)) {
        setProjectFeatureUnavailable(true)
        setError(
          'Event/projekt er ikke aktiveret i databasen endnu. Kør den nye Supabase migration og genindlæs siden.',
        )
      } else {
        setError(updateErr.message)
      }
      return
    }
    setRows((prev) =>
      prev.map((row) => (row.id === v.id ? { ...row, voucher_project_id: projectId } : row)),
    )
  }

  async function updateVoucherCategory(v: Voucher, category: string | null) {
    if (!currentCompany) return
    setAssigningCategoryId(v.id)
    setError(null)
    const { error: updateErr } = await supabase
      .from('vouchers')
      .update({ category })
      .eq('id', v.id)
      .eq('company_id', currentCompany.id)
    setAssigningCategoryId(null)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setRows((prev) =>
      prev.map((row) => (row.id === v.id ? { ...row, category } : row)),
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
    let url: string
    try {
      const { data, error: err } = await supabase.storage
        .from('vouchers')
        .createSignedUrl(v.storage_path, 3600)
      if (err || !data?.signedUrl) {
        setError(err?.message ?? 'Kunne ikke åbne fil')
        return
      }
      url = data.signedUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke åbne fil')
      return
    }
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (w) return
    // Pop op blokeret: åbn i samme fane så brugeren ikke får en tom fane
    window.location.assign(url)
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bilag</h1>
          <p className="text-sm text-slate-600">
            Scan med kamera, upload en fil, eller træk filer ind et vilkårligt sted på siden. Kun
            denne virksomhed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          <Link
            to="/app/vouchers/scan"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Scan bilag
          </Link>
          <label
            className={
              'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 ' +
              (uploading ? 'pointer-events-none opacity-60' : '')
            }
          >
            {uploading
              ? ocrProgress != null
                ? `Læser… ${ocrProgress}%`
                : 'Uploader…'
              : 'Upload bilag'}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onFile(e)}
            />
          </label>
          <div className="flex min-h-[44px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <select
              value={expenseLinkMode}
              onChange={(e) => setExpenseLinkMode(e.target.value as ExpenseLinkMode)}
              disabled={!canUseExpenseLinks}
              className="min-h-[44px] border-0 bg-white px-3 text-sm text-slate-900 focus:outline-none"
              aria-label="Udlægslink type"
            >
              <option value="single_use">1 upload</option>
              <option value="time_window">1 time</option>
            </select>
            <button
              type="button"
              disabled={creatingExpenseLink || !canUseExpenseLinks}
              onClick={() => void createExpenseUploadLink()}
              className="inline-flex min-h-[44px] items-center justify-center border-l border-slate-200 bg-white px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-70"
              title={!canUseExpenseLinks ? 'Udlægslink er ikke aktivt i den nuværende plan' : undefined}
            >
              {creatingExpenseLink ? 'Opretter…' : 'Udlægslink'}
            </button>
          </div>
        </div>
      </div>

      {ocrWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ocrWarning}
        </p>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      {expenseLink ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="shrink-0 text-sm font-semibold text-emerald-950">
              Udlægslink klar
            </span>
            <input
              readOnly
              value={expenseLink}
              className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={() => void copyExpenseLink()}
              className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Kopiér
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-2">
        <h2 className="text-base font-semibold text-slate-900">Dine bilag</h2>
        <DesktopListCardsToggle mode={desktopView} onChange={setDesktopView} />
      </div>

      <label className="block">
        <span className="sr-only">Søg i bilag</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Søg efter titel, fil, kategori, event, beløb, dato …"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          autoComplete="off"
        />
      </label>

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

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">Filtrer på event/projekt</span>
              <select
                value={projectFilter}
                disabled={projectFeatureUnavailable || !canUseVoucherProjects}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="all">Alle bilag</option>
                <option value="none">Uden event/projekt</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={projectFeatureUnavailable || !canUseVoucherProjects}
              onClick={() => setProjectCreateOpen((open) => !open)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {projectCreateOpen ? 'Luk' : '+ Event'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              {filteredRows.length} bilag
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              {formatDkk(voucherTotals.gross)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              Moms {formatDkk(voucherTotals.vat)}
            </span>
            {projectTotals.length > 0 ? (
              <button
                type="button"
                onClick={() => setProjectOverviewOpen((open) => !open)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Event-overblik
              </button>
            ) : null}
          </div>
        </div>

          {projectCreateOpen ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Navn på nyt event/projekt
                </span>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
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
              </label>
            </div>
          ) : null}
      </div>

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
            Ingen bilag endnu.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Ingen bilag matcher søgningen.
          </p>
        ) : (
          filteredRows.map((v) => {
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
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {dateStr}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {v.gross_cents ? formatDkk(v.gross_cents) : '—'}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{v.title ?? '—'}</p>
                {reimbursement ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                    <div className="font-semibold">Udlæg: {reimbursement.requester_name}</div>
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
                    <div className="mt-1 text-emerald-900/80">
                      {reimbursement.bank_reg_number || reimbursement.bank_account_number
                        ? `Reg. ${reimbursement.bank_reg_number ?? '—'} / Konto ${reimbursement.bank_account_number ?? '—'}`
                        : 'Ingen konto angivet'}
                    </div>
                  </div>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Kategori</span>
                    <select
                      value={v.category ?? ''}
                      disabled={assigningCategoryId === v.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation()
                        void updateVoucherCategory(v, e.target.value || null)
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                    >
                      <option value="">Uden kategori</option>
                      {VOUCHER_CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>{v.vat_cents ? `Moms ${formatDkk(v.vat_cents)}` : 'Moms —'}</span>
                </div>
                <label className="block border-t border-slate-100 pt-2">
                  <span className="sr-only">Event/projekt</span>
                  <select
                    value={v.voucher_project_id ?? ''}
                    disabled={!canUseVoucherProjects || projectFeatureUnavailable || assigningVoucherId === v.id}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation()
                      void updateVoucherProject(v, e.target.value || null)
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                  >
                    <option value="">Uden event/projekt</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
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
              <SortableTh
                label="Moms"
                isActive={sortKey === 'vat'}
                direction={sortKey === 'vat' ? sortDir : null}
                onClick={() => onSortColumn('vat')}
                align="right"
              />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Ingen bilag endnu.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Ingen bilag matcher søgningen.
                </td>
              </tr>
            ) : (
              filteredRows.map((v) => {
                const reimbursement = reimbursementByVoucherId.get(v.id)
                return (
                <tr key={v.id} id={`voucher-row-${v.id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">
                    {v.expense_date
                      ? formatDateOnly(v.expense_date)
                      : formatDateOnly(v.uploaded_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{v.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <select
                      value={v.category ?? ''}
                      disabled={assigningCategoryId === v.id}
                      onChange={(e) => void updateVoucherCategory(v, e.target.value || null)}
                      className="w-full min-w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {VOUCHER_CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <select
                      value={v.voucher_project_id ?? ''}
                      disabled={!canUseVoucherProjects || projectFeatureUnavailable || assigningVoucherId === v.id}
                      onChange={(e) => void updateVoucherProject(v, e.target.value || null)}
                      className="w-full min-w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {reimbursement ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-900">
                          {reimbursement.requester_name}
                        </div>
                        <select
                          value={reimbursement.status}
                          onChange={(e) =>
                            void updateReimbursementStatus(
                              reimbursement,
                              e.target.value as ReimbursementStatus,
                            )
                          }
                          className="w-full min-w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        >
                          {Object.entries(reimbursementStatusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {v.gross_cents ? formatDkk(v.gross_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {v.vat_cents ? formatDkk(v.vat_cents) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-600 hover:underline"
                        onClick={() => openSigned(v)}
                      >
                        Åbn
                      </button>
                      {canDeleteVoucher ? (
                        <button
                          type="button"
                          disabled={deletingId === v.id}
                          className="text-sm font-medium text-rose-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void deleteVoucher(v)}
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
      </AppPageLayout>
    </div>
  )
}

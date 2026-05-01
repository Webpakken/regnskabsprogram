import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { InvoicePdfCanvasViewer } from '@/components/InvoicePdfCanvasViewer'
import { VOUCHER_CATEGORY_OPTIONS } from '@/lib/voucherCategories'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDkk } from '@/lib/format'
import type { CompanyRole, Database } from '@/types/database'

type Voucher = Database['public']['Tables']['vouchers']['Row']
type VoucherProject = Database['public']['Tables']['voucher_projects']['Row']
type Reimbursement = Database['public']['Tables']['voucher_reimbursements']['Row']
type ReimbursementStatus = Reimbursement['status']

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

const reimbursementStatusLabels: Record<ReimbursementStatus, string> = {
  pending_approval: 'Afventer godkendelse',
  ready_for_refund: 'Klar til refundering',
  refunded: 'Refunderet',
  rejected: 'Afvist',
}

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

function canDelete(role: CompanyRole | null) {
  return role === 'owner' || role === 'manager' || role === 'bookkeeper'
}

export function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentCompany, currentRole, billingEntitlements, canUse } = useApp()
  const isForening = currentCompany?.entity_type === 'forening'
  const featureGateKnown = billingEntitlements.length > 0
  const canUseVoucherProjects = !featureGateKnown || canUse('voucher_projects')
  const showVat = !isForening
  const canEdit = canDelete(currentRole)

  const [voucher, setVoucher] = useState<Voucher | null>(null)
  const [projects, setProjects] = useState<VoucherProject[]>([])
  const [reimbursement, setReimbursement] = useState<Reimbursement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [duplicateOriginal, setDuplicateOriginal] = useState<{ id: string; title: string | null; expense_date: string; gross_cents: number } | null>(null)
  const [dismissingDuplicate, setDismissingDuplicate] = useState(false)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [grossKr, setGrossKr] = useState('')
  const [vatKr, setVatKr] = useState('')
  const [category, setCategory] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!id || !currentCompany) return
    setLoading(true)
    setLoadError(null)
    const [voucherRes, projectRes, reimbRes] = await Promise.all([
      supabase
        .from('vouchers')
        .select('*')
        .eq('id', id)
        .eq('company_id', currentCompany.id)
        .maybeSingle(),
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
        .eq('voucher_id', id)
        .maybeSingle(),
    ])
    if (voucherRes.error || !voucherRes.data) {
      setLoadError(voucherRes.error?.message ?? 'Bilaget findes ikke.')
      setLoading(false)
      return
    }
    const v = voucherRes.data
    setVoucher(v)
    setProjects(projectRes.data ?? [])
    setReimbursement(reimbRes.data ?? null)
    setTitle(v.title ?? '')
    setDate(v.expense_date)
    setGrossKr(centsToKrInput(v.gross_cents))
    setVatKr(centsToKrInput(v.vat_cents))
    setCategory(v.category ?? '')
    setProjectId(v.voucher_project_id ?? '')
    if (v.possible_duplicate_of) {
      const { data: orig } = await supabase
        .from('vouchers')
        .select('id, title, expense_date, gross_cents')
        .eq('id', v.possible_duplicate_of)
        .eq('company_id', currentCompany.id)
        .maybeSingle()
      setDuplicateOriginal(orig ?? null)
    } else {
      setDuplicateOriginal(null)
    }
    const signed = await supabase.storage
      .from('vouchers')
      .createSignedUrl(v.storage_path, 3600)
    if (signed.error || !signed.data?.signedUrl) {
      setLoadError(signed.error?.message ?? 'Kunne ikke åbne fil.')
    } else {
      setUrl(signed.data.signedUrl)
    }
    setLoading(false)
  }, [id, currentCompany])

  async function dismissDuplicate() {
    if (!voucher || !currentCompany) return
    setDismissingDuplicate(true)
    const { error } = await supabase
      .from('vouchers')
      .update({ possible_duplicate_of: null })
      .eq('id', voucher.id)
      .eq('company_id', currentCompany.id)
    setDismissingDuplicate(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setVoucher({ ...voucher, possible_duplicate_of: null })
    setDuplicateOriginal(null)
  }

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!voucher || !currentCompany) return
    setFormError(null)
    setFormMessage(null)
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
    const updates: Partial<VoucherEditableFields> = {
      title: title.trim() ? title.trim() : null,
      expense_date: date,
      gross_cents: grossCents,
      vat_cents: vatCents,
      net_cents: netCents,
      vat_rate: vatRate,
      category: category || null,
      voucher_project_id: canUseVoucherProjects ? (projectId || null) : voucher.voucher_project_id,
    }
    setSaving(true)
    const { error } = await supabase
      .from('vouchers')
      .update(updates)
      .eq('id', voucher.id)
      .eq('company_id', currentCompany.id)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setVoucher({ ...voucher, ...updates } as Voucher)
    setFormMessage('Gemt.')
  }

  async function updateReimbursementStatus(status: ReimbursementStatus) {
    if (!reimbursement || !currentCompany) return
    const previous = reimbursement.status
    setReimbursement({ ...reimbursement, status })
    const { error } = await supabase
      .from('voucher_reimbursements')
      .update({ status })
      .eq('id', reimbursement.id)
      .eq('company_id', currentCompany.id)
    if (error) {
      setReimbursement({ ...reimbursement, status: previous })
      setFormError(error.message)
    }
  }

  async function handleDelete() {
    if (!voucher || !currentCompany) return
    if (!window.confirm('Slet bilaget? Handlingen kan ikke fortrydes.')) return
    setDeleting(true)
    setFormError(null)
    await supabase.storage.from('vouchers').remove([voucher.storage_path])
    const { error } = await supabase
      .from('vouchers')
      .delete()
      .eq('id', voucher.id)
      .eq('company_id', currentCompany.id)
    setDeleting(false)
    if (error) {
      setFormError(error.message)
      return
    }
    navigate('/app/vouchers')
  }

  if (!currentCompany) {
    return (
      <AppPageLayout maxWidth="full">
        <p className="text-slate-600">Vælg virksomhed.</p>
      </AppPageLayout>
    )
  }

  if (loading) {
    return (
      <AppPageLayout maxWidth="full">
        <p className="text-sm text-slate-500">Indlæser…</p>
      </AppPageLayout>
    )
  }

  if (loadError || !voucher) {
    return (
      <AppPageLayout maxWidth="full" className="space-y-4">
        <Link
          to="/app/vouchers"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Tilbage
        </Link>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError ?? 'Bilaget findes ikke.'}
        </p>
      </AppPageLayout>
    )
  }

  const mime = voucher.mime_type ?? ''
  const isImage =
    mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(voucher.storage_path)

  return (
    <AppPageLayout maxWidth="full" className="space-y-4">
      <Link
        to="/app/vouchers"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
      >
        ← Tilbage til bilag
      </Link>

      {voucher.possible_duplicate_of ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Mulig dublering</p>
          <p className="mt-1 text-amber-900/90">
            {duplicateOriginal
              ? `Bilaget ligner et eksisterende bilag «${duplicateOriginal.title ?? 'Bilag'}» fra ${duplicateOriginal.expense_date} (${formatDkk(duplicateOriginal.gross_cents)}).`
              : 'Bilaget ligner et andet bilag (samme dato/beløb).'}{' '}
            Bekræft at det ikke er en dublering hvis det er to forskellige køb.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {duplicateOriginal ? (
              <Link
                to={`/app/vouchers/${duplicateOriginal.id}`}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Sammenlign
              </Link>
            ) : null}
            <button
              type="button"
              disabled={dismissingDuplicate}
              onClick={() => void dismissDuplicate()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {dismissingDuplicate ? 'Bekræfter…' : 'Det er ikke en dublering'}
            </button>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                    void updateReimbursementStatus(e.target.value as ReimbursementStatus)
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

          {reimbursement ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
              <div className="font-semibold">Udlæg: {reimbursement.requester_name}</div>
              <div className="mt-1 space-y-0.5">
                <div className="text-emerald-900/80">
                  <span className="text-emerald-900/60">Reg.nr.: </span>
                  <span className="font-medium">{reimbursement.bank_reg_number ?? '—'}</span>
                </div>
                <div className="text-emerald-900/80">
                  <span className="text-emerald-900/60">Kontonr.: </span>
                  <span className="font-medium">{reimbursement.bank_account_number ?? '—'}</span>
                </div>
                {reimbursement.phone ? (
                  <div className="text-emerald-900/80">
                    <span className="text-emerald-900/60">Telefon: </span>
                    <span className="font-medium">{reimbursement.phone}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              {deleting ? 'Sletter…' : 'Slet bilag'}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {formError ? (
                <span className="text-xs font-medium text-rose-700">{formError}</span>
              ) : null}
              {formMessage ? (
                <span className="text-xs font-medium text-emerald-700">{formMessage}</span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Gemmer…' : 'Gem ændringer'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="overflow-auto rounded-xl bg-slate-100">
          {url ? (
            isImage ? (
              <img
                src={url}
                alt={voucher.title ?? 'Bilag'}
                className="mx-auto block max-h-[80vh] object-contain"
              />
            ) : (
              <InvoicePdfCanvasViewer pdfUrl={url} title={voucher.title ?? 'Bilag'} />
            )
          ) : null}
        </div>
        <p className="mt-2 px-1 text-xs text-slate-500">
          {voucher.gross_cents ? formatDkk(voucher.gross_cents) : '—'}
        </p>
      </section>
    </AppPageLayout>
  )
}

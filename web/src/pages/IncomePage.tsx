import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { supabase } from '@/lib/supabase'
import { hasRole, useApp } from '@/context/AppProvider'
import { formatDateOnly, formatDkk } from '@/lib/format'
import type { Database, IncomeKind } from '@/types/database'

type IncomeSortKey = 'date' | 'type' | 'source' | 'earmarking' | 'amount'

type IncomeEntry = Database['public']['Tables']['income_entries']['Row']

const KIND_OPTIONS: { value: IncomeKind; label: string }[] = [
  { value: 'kommunalt_tilskud', label: 'Kommunalt tilskud' },
  { value: 'fondsbevilling', label: 'Fondsbevilling' },
  { value: 'medlemskontingent', label: 'Medlemskontingent' },
  { value: 'donation', label: 'Donation' },
  { value: 'event', label: 'Eventindtægt' },
  { value: 'andet', label: 'Andet' },
]

const KIND_LABEL: Record<IncomeKind, string> = Object.fromEntries(
  KIND_OPTIONS.map((o) => [o.value, o.label]),
) as Record<IncomeKind, string>

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export function IncomePage() {
  const { currentCompany, currentRole } = useApp()
  const canWrite = hasRole(currentRole, ['owner', 'manager', 'bookkeeper'])

  const [entries, setEntries] = useState<IncomeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Form state
  const [entryDate, setEntryDate] = useState(todayIso)
  const [kind, setKind] = useState<IncomeKind>('kommunalt_tilskud')
  const [amount, setAmount] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [earmarking, setEarmarking] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [sortKey, setSortKey] = useState<IncomeSortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')

  function onSortColumn(col: IncomeSortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as IncomeSortKey | null)
    setSortDir(next.dir)
  }

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      const haystack = [
        e.source_name,
        e.earmarking ?? '',
        e.notes ?? '',
        KIND_LABEL[e.kind],
        formatDateOnly(e.entry_date),
        (e.amount_cents / 100).toFixed(2),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, searchQuery])

  const displayEntries = useMemo(() => {
    if (sortKey === null) return filteredEntries
    const mul = sortDir === 'asc' ? 1 : -1
    return [...filteredEntries].sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return mul * String(a.entry_date).localeCompare(String(b.entry_date))
        case 'type':
          return (
            mul *
            KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind], 'da', { sensitivity: 'base' })
          )
        case 'source':
          return (
            mul *
            String(a.source_name).localeCompare(String(b.source_name), 'da', {
              sensitivity: 'base',
            })
          )
        case 'earmarking':
          return (
            mul *
            String(a.earmarking ?? '').localeCompare(String(b.earmarking ?? ''), 'da', {
              sensitivity: 'base',
            })
          )
        case 'amount':
          return mul * (a.amount_cents - b.amount_cents)
        default:
          return 0
      }
    })
  }, [filteredEntries, sortKey, sortDir])

  const load = useCallback(async () => {
    if (!currentCompany) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('income_entries')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setEntries((data ?? []) as IncomeEntry[])
  }, [currentCompany])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm() {
    setEntryDate(todayIso())
    setKind('kommunalt_tilskud')
    setAmount('')
    setSourceName('')
    setEarmarking('')
    setNotes('')
    setEditingId(null)
    setFormOpen(false)
  }

  function startEdit(entry: IncomeEntry) {
    setEditingId(entry.id)
    setEntryDate(entry.entry_date)
    setKind(entry.kind)
    setAmount((entry.amount_cents / 100).toFixed(2).replace('.', ','))
    setSourceName(entry.source_name)
    setEarmarking(entry.earmarking ?? '')
    setNotes(entry.notes ?? '')
    setMessage(null)
    setError(null)
    setFormOpen(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentCompany || !canWrite) return
    setError(null)
    setMessage(null)
    const cents = parseAmountToCents(amount)
    if (cents === null) {
      setError('Indtast et gyldigt beløb større end 0.')
      return
    }
    if (!sourceName.trim()) {
      setError('Udfyld hvem indtægten kommer fra.')
      return
    }
    setSubmitting(true)
    if (editingId) {
      const { error: err } = await supabase
        .from('income_entries')
        .update({
          entry_date: entryDate,
          amount_cents: cents,
          kind,
          source_name: sourceName.trim(),
          earmarking: earmarking.trim() || null,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId)
      setSubmitting(false)
      if (err) {
        setError(err.message)
        return
      }
      setMessage('Indtægt opdateret.')
    } else {
      const { error: err } = await supabase.from('income_entries').insert({
        company_id: currentCompany.id,
        entry_date: entryDate,
        amount_cents: cents,
        kind,
        source_name: sourceName.trim(),
        earmarking: earmarking.trim() || null,
        notes: notes.trim() || null,
      })
      setSubmitting(false)
      if (err) {
        setError(err.message)
        return
      }
      setMessage('Indtægt registreret.')
    }
    resetForm()
    await load()
  }

  async function remove(entry: IncomeEntry) {
    if (!canWrite) return
    if (
      !confirm(
        `Slet indtægten på ${formatDkk(entry.amount_cents)} fra ${entry.source_name}? Det kan ikke fortrydes.`,
      )
    )
      return
    const { error: err } = await supabase
      .from('income_entries')
      .delete()
      .eq('id', entry.id)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Indtægt slettet.')
    await load()
  }

  const filteredTotalCents = useMemo(
    () => filteredEntries.reduce((sum, e) => sum + e.amount_cents, 0),
    [filteredEntries],
  )
  const filteredTotalCount = filteredEntries.length

  if (!currentCompany) {
    return <p className="text-slate-600">Vælg en virksomhed først.</p>
  }

  return (
    <AppPageLayout maxWidth="full" className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">Indtægter</h1>
          <p className="text-sm text-slate-600">
            Tilskud, bevillinger, kontingent og donationer
          </p>
        </div>
        {canWrite && !formOpen ? (
          <button
            type="button"
            onClick={() => {
              setFormOpen(true)
              setMessage(null)
              setError(null)
            }}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ny indtægt
          </button>
        ) : null}
      </div>

      {canWrite && formOpen ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-slate-900">
              {editingId ? 'Rediger indtægt' : 'Ny indtægt'}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              aria-label="Luk formular"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="iedate">
                Dato
              </label>
              <input
                id="iedate"
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="iekind">
                Type
              </label>
              <select
                id="iekind"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as IncomeKind)}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="ieamount">
                Beløb (kr.)
              </label>
              <input
                id="ieamount"
                type="text"
                inputMode="decimal"
                required
                placeholder="Fx 12500,00"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="iesource">
                Modtaget fra
              </label>
              <input
                id="iesource"
                type="text"
                required
                placeholder="Fx Aarhus Kommune, Tuborgfondet"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="ieearmark">
                Øremærkning (valgfrit)
              </label>
              <input
                id="ieearmark"
                type="text"
                placeholder="Fx Sommerlejr 2026, Renovation klubhus"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={earmarking}
                onChange={(e) => setEarmarking(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Brug øremærkning til at samle bevillinger og udgifter til samme aktivitet/projekt.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="ienotes">
                Noter (valgfrit)
              </label>
              <textarea
                id="ienotes"
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Fx bevillingsperiode, vilkår, sagsnr."
              />
            </div>
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-emerald-700" role="status">
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting
                ? 'Gemmer…'
                : editingId
                  ? 'Gem ændringer'
                  : 'Registrér indtægt'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annullér
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!canWrite ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Du har ikke rettigheder til at oprette eller redigere indtægter.
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Søg i indtægter</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Søg i kilde, øremærkning, type, beløb…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {filteredTotalCount} {filteredTotalCount === 1 ? 'post' : 'poster'}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {formatDkk(filteredTotalCents)}
        </span>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white py-6 text-center text-sm text-slate-500 shadow-sm">
            Indlæser…
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white py-6 text-center text-sm text-slate-500 shadow-sm">
            Ingen indtægter endnu. Registrér den første ovenfor.
          </p>
        ) : displayEntries.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white py-6 text-center text-sm text-slate-500 shadow-sm">
            Ingen indtægter matcher søgningen.
          </p>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {displayEntries.map((entry) => {
              const clickable = canWrite
              return (
                <div
                  key={entry.id}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => startEdit(entry) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            startEdit(entry)
                          }
                        }
                      : undefined
                  }
                  className={`flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition ${
                    clickable
                      ? 'cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
                      : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium uppercase tracking-wide text-slate-500">
                      {formatDateOnly(entry.entry_date)}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {KIND_LABEL[entry.kind]}
                      </span>
                      {entry.earmarking ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {entry.earmarking}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-slate-800">
                      {entry.source_name}
                    </p>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">
                      {formatDkk(entry.amount_cents)}
                    </span>
                  </div>
                  {canWrite ? (
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <span className="text-sm font-medium text-indigo-600">Rediger →</span>
                      <button
                        type="button"
                        aria-label="Slet indtægt"
                        onClick={(e) => {
                          e.stopPropagation()
                          void remove(entry)
                        }}
                        className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <SortableTh
                    label="Dato"
                    isActive={sortKey === 'date'}
                    direction={sortKey === 'date' ? sortDir : null}
                    onClick={() => onSortColumn('date')}
                  />
                  <SortableTh
                    label="Type"
                    isActive={sortKey === 'type'}
                    direction={sortKey === 'type' ? sortDir : null}
                    onClick={() => onSortColumn('type')}
                  />
                  <SortableTh
                    label="Modtaget fra"
                    isActive={sortKey === 'source'}
                    direction={sortKey === 'source' ? sortDir : null}
                    onClick={() => onSortColumn('source')}
                  />
                  <SortableTh
                    label="Øremærkning"
                    isActive={sortKey === 'earmarking'}
                    direction={sortKey === 'earmarking' ? sortDir : null}
                    onClick={() => onSortColumn('earmarking')}
                  />
                  <SortableTh
                    label="Beløb"
                    isActive={sortKey === 'amount'}
                    direction={sortKey === 'amount' ? sortDir : null}
                    onClick={() => onSortColumn('amount')}
                    align="right"
                  />
                  {canWrite ? <th className="px-6 py-3 text-right">Handling</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-3 text-slate-700">
                      {formatDateOnly(entry.entry_date)}
                    </td>
                    <td className="px-6 py-3 text-slate-700">{KIND_LABEL[entry.kind]}</td>
                    <td className="px-6 py-3 text-slate-700">{entry.source_name}</td>
                    <td className="px-6 py-3 text-slate-500">{entry.earmarking ?? '—'}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-medium text-slate-900">
                      {formatDkk(entry.amount_cents)}
                    </td>
                    {canWrite ? (
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Rediger
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(entry)}
                            className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Slet
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </AppPageLayout>
  )
}

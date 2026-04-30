import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { invokePlatformEmail } from '@/lib/edge'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, hasRole, useApp } from '@/context/AppProvider'
import type { CompanyRole } from '@/types/database'
import { formatDateTime } from '@/lib/format'

type MemberRow = {
  id: string
  user_id: string
  role: CompanyRole
  created_at: string
  email?: string | null
  full_name?: string | null
  last_active_at: string | null
}

type InviteRow = {
  id: string
  email: string
  role: CompanyRole
  created_at: string
}

const INACTIVE_DAYS = 30

function activityStatus(lastActiveAt: string | null): {
  label: string
  className: string
} {
  if (!lastActiveAt) {
    return {
      label: 'Ingen aktivitet endnu',
      className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
    }
  }
  const diffDays = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86400000)
  if (diffDays <= INACTIVE_DAYS) {
    return {
      label: 'Aktiv',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
    }
  }
  return {
    label: 'Inaktiv',
    className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100',
  }
}

const ROLES: CompanyRole[] = ['owner', 'manager', 'bookkeeper', 'accountant']

type MemberSortKey = 'name' | 'role' | 'added' | 'last_active'
type InviteSortKey = 'email' | 'role' | 'sent'

function sortMembers(list: MemberRow[], key: MemberSortKey, dir: ColumnSortDir): MemberRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'name':
        return (
          mul *
          String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''), 'da', { sensitivity: 'base' })
        )
      case 'role':
        return mul * String(a.role).localeCompare(String(b.role))
      case 'added':
        return mul * String(a.created_at).localeCompare(String(b.created_at))
      case 'last_active':
        return mul * String(a.last_active_at ?? '').localeCompare(String(b.last_active_at ?? ''))
      default:
        return 0
    }
  })
}

function sortInvites(list: InviteRow[], key: InviteSortKey, dir: ColumnSortDir): InviteRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'email':
        return mul * String(a.email).localeCompare(String(b.email), 'da', { sensitivity: 'base' })
      case 'role':
        return mul * String(a.role).localeCompare(String(b.role))
      case 'sent':
        return mul * String(a.created_at).localeCompare(String(b.created_at))
      default:
        return 0
    }
  })
}

const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  owner: 'Fuld adgang. Abonnement, medlemmer og virksomhed.',
  manager: 'Virksomhedsdrift: bank, CVR og daglig bogføring.',
  bookkeeper: 'Daglig bogføring: fakturaer, bilag, bank-match.',
  accountant: 'Læseadgang og eksport — til revisor.',
}

function isDuplicateInviteError(err: { code?: string; message?: string } | null) {
  if (!err) return false
  return (
    err.code === '23505'
    || /pending_invites_company_email_key|duplicate key|unique constraint/i.test(err.message ?? '')
  )
}

export function MembersPage() {
  const { currentCompany, currentRole, user } = useApp()
  const canManage = hasRole(currentRole, ['owner'])

  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<CompanyRole>('bookkeeper')
  const [inviting, setInviting] = useState(false)
  const [memberSortKey, setMemberSortKey] = useState<MemberSortKey | null>(null)
  const [memberSortDir, setMemberSortDir] = useState<ColumnSortDir>('desc')
  const [inviteSortKey, setInviteSortKey] = useState<InviteSortKey | null>(null)
  const [inviteSortDir, setInviteSortDir] = useState<ColumnSortDir>('desc')

  const sortedMembers = useMemo(() => {
    if (memberSortKey === null) return members
    return sortMembers(members, memberSortKey, memberSortDir)
  }, [members, memberSortKey, memberSortDir])

  const sortedInvites = useMemo(() => {
    if (inviteSortKey === null) return invites
    return sortInvites(invites, inviteSortKey, inviteSortDir)
  }, [invites, inviteSortKey, inviteSortDir])

  function onMemberSort(col: MemberSortKey) {
    const next = nextColumnSortState(col, memberSortKey, memberSortDir, true)
    setMemberSortKey(next.key as MemberSortKey | null)
    setMemberSortDir(next.dir)
  }

  function onInviteSort(col: InviteSortKey) {
    const next = nextColumnSortState(col, inviteSortKey, inviteSortDir, true)
    setInviteSortKey(next.key as InviteSortKey | null)
    setInviteSortDir(next.dir)
  }

  const load = useCallback(async () => {
    if (!currentCompany) return
    setLoading(true)

    // Claim eventuelle invitationer på min email (fanger brugere der havde konto før de blev inviteret).
    // Fjern stale invitationer (email matcher allerede et company_member i firmaet) — kun for owners.
    await Promise.allSettled([
      supabase.rpc('claim_my_pending_invites'),
      canManage
        ? supabase.rpc('prune_stale_invites_for', { p_company_id: currentCompany.id })
        : Promise.resolve(),
    ])

    const [membersRes, invitesRes, activityRes] = await Promise.all([
      supabase
        .from('company_members')
        .select('id, user_id, role, created_at')
        .eq('company_id', currentCompany.id),
      canManage
        ? supabase
            .from('pending_invites')
            .select('id, email, role, created_at')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as InviteRow[], error: null }),
      supabase
        .from('activity_events')
        .select('actor_id, created_at')
        .eq('company_id', currentCompany.id)
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    const lastActiveByUser = new Map<string, string>()
    for (const row of (activityRes.data ?? []) as Array<{
      actor_id: string | null
      created_at: string
    }>) {
      if (!row.actor_id) continue
      const prev = lastActiveByUser.get(row.actor_id)
      if (!prev || row.created_at > prev) {
        lastActiveByUser.set(row.actor_id, row.created_at)
      }
    }

    const rawMembers = (membersRes.data ?? []) as Array<{
      id: string
      user_id: string
      role: CompanyRole
      created_at: string
    }>

    const userIds = rawMembers.map((m) => m.user_id)
    const namesByUser = new Map<string, string | null>()
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
      for (const p of (profileRows ?? []) as Array<{ id: string; full_name: string | null }>) {
        namesByUser.set(p.id, p.full_name)
      }
    }

    setMembers(
      rawMembers.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        full_name: namesByUser.get(m.user_id) ?? null,
        last_active_at: lastActiveByUser.get(m.user_id) ?? null,
      })),
    )
    setInvites((invitesRes.data ?? []) as InviteRow[])
    setLoading(false)
  }, [currentCompany, canManage])

  useEffect(() => {
    void load()
  }, [load])

  async function updateRole(memberId: string, role: CompanyRole) {
    setError(null)
    setMessage(null)
    const { error: err } = await supabase
      .from('company_members')
      .update({ role })
      .eq('id', memberId)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Rolle opdateret.')
    await load()
  }

  async function removeMember(memberId: string, userId: string) {
    if (userId === user?.id) {
      setError('Du kan ikke fjerne dig selv.')
      return
    }
    if (!confirm('Fjern medlem fra virksomheden?')) return
    setError(null)
    setMessage(null)
    const { error: err } = await supabase
      .from('company_members')
      .delete()
      .eq('id', memberId)
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Medlem fjernet.')
    await load()
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    if (!currentCompany) return
    setError(null)
    setMessage(null)
    setInviting(true)
    const email = inviteEmail.trim().toLowerCase()
    const { error: err } = await supabase.from('pending_invites').insert({
      company_id: currentCompany.id,
      email,
      role: inviteRole,
      invited_by: user?.id ?? null,
    })
    setInviting(false)
    if (err) {
      if (isDuplicateInviteError(err)) {
        setMessage(`Invitationen til ${email} findes allerede under afventende invitationer.`)
        await load()
        return
      }
      setError(err.message)
      return
    }
    try {
      await invokePlatformEmail('company_member_invite', {
        company_id: currentCompany.id,
        invitee_email: email,
        role: inviteRole,
      })
    } catch {
      /* invitation er oprettet; mail er valgfri */
    }
    setInviteEmail('')
    setInviteRole('bookkeeper')
    setMessage(
      `Invitation oprettet. ${email} tilføjes automatisk når de opretter konto.`,
    )
    await load()
  }

  async function deleteInvite(inviteId: string, email: string) {
    if (!confirm(`Slet invitationen til ${email}? Det kan ikke fortrydes.`)) return
    setError(null)
    setMessage(null)
    const { error: err } = await supabase
      .from('pending_invites')
      .delete()
      .eq('id', inviteId)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(`Invitationen til ${email} er slettet.`)
    await load()
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Opret virksomhed først.</p>
  }

  return (
    <AppPageLayout maxWidth="full" className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Medlemmer</h1>
        <p className="text-sm text-slate-600">
          Inviter revisor, bogholder eller en anden ejer — og administrer roller.
        </p>
      </div>

      {!loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Aktive"
            sublabel={`Aktivitet sidste ${INACTIVE_DAYS} dage`}
            value={
              members.filter(
                (m) =>
                  m.last_active_at &&
                  Date.now() - new Date(m.last_active_at).getTime() <= INACTIVE_DAYS * 86400000,
              ).length
            }
            tone="emerald"
          />
          <StatCard
            label="Inaktive"
            sublabel={`Sidst set for over ${INACTIVE_DAYS} dage siden`}
            value={
              members.filter(
                (m) =>
                  m.last_active_at &&
                  Date.now() - new Date(m.last_active_at).getTime() > INACTIVE_DAYS * 86400000,
              ).length
            }
            tone="amber"
          />
          <StatCard
            label="Ikke logget aktivitet"
            sublabel="Tilmeldt, men ikke brugt platformen"
            value={members.filter((m) => !m.last_active_at).length}
            tone="slate"
          />
          <StatCard
            label="Afventer registrering"
            sublabel="Inviteret, ikke tilmeldt endnu"
            value={invites.length}
            tone="indigo"
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Aktive medlemmer</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Indlæser…</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Ingen medlemmer endnu.</p>
        ) : (
          <>
          <div className="mt-4 space-y-3 md:hidden">
            {sortedMembers.map((m) => {
              const isSelf = m.user_id === user?.id
              const status = activityStatus(m.last_active_at)
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {m.full_name?.trim() || 'Uden navn'}
                        {isSelf ? <span className="ml-2 text-xs text-slate-400">(dig)</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Tilføjet {formatDateTime(m.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  {m.last_active_at ? (
                    <p className="text-xs text-slate-500">
                      Sidste aktivitet: {formatDateTime(m.last_active_at)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    {canManage && !isSelf ? (
                      <select
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        value={m.role}
                        onChange={(e) => void updateRole(m.id, e.target.value as CompanyRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {ROLE_LABELS[m.role]}
                      </span>
                    )}
                    {canManage && !isSelf ? (
                      <button
                        type="button"
                        onClick={() => void removeMember(m.id, m.user_id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Fjern
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-100 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <SortableTh
                    label="Navn"
                    isActive={memberSortKey === 'name'}
                    direction={memberSortKey === 'name' ? memberSortDir : null}
                    onClick={() => onMemberSort('name')}
                  />
                  <SortableTh
                    label="Rolle"
                    isActive={memberSortKey === 'role'}
                    direction={memberSortKey === 'role' ? memberSortDir : null}
                    onClick={() => onMemberSort('role')}
                  />
                  <SortableTh
                    label="Tilføjet"
                    isActive={memberSortKey === 'added'}
                    direction={memberSortKey === 'added' ? memberSortDir : null}
                    onClick={() => onMemberSort('added')}
                  />
                  <SortableTh
                    label="Sidste aktivitet"
                    isActive={memberSortKey === 'last_active'}
                    direction={memberSortKey === 'last_active' ? memberSortDir : null}
                    onClick={() => onMemberSort('last_active')}
                  />
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Handling
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedMembers.map((m) => {
                  const isSelf = m.user_id === user?.id
                  const status = activityStatus(m.last_active_at)
                  return (
                    <tr key={m.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {m.full_name?.trim() || 'Uden navn'}
                          {isSelf ? <span className="ml-2 text-xs text-slate-400">(dig)</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {canManage && !isSelf ? (
                          <select
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                            value={m.role}
                            onChange={(e) => void updateRole(m.id, e.target.value as CompanyRole)}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {ROLE_LABELS[m.role]}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {formatDateTime(m.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}
                          >
                            {status.label}
                          </span>
                          {m.last_active_at ? (
                            <span className="text-xs text-slate-500">
                              {formatDateTime(m.last_active_at)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && !isSelf ? (
                          <button
                            type="button"
                            onClick={() => void removeMember(m.id, m.user_id)}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Fjern
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {canManage ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-900">Inviter medlem</h2>
            <p className="mt-1 text-sm text-slate-600">
              Personen tilføjes automatisk første gang de opretter konto med denne e-mail.
            </p>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => void invite(e)}>
              <input
                type="email"
                required
                placeholder="kollega@firma.dk"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as CompanyRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {inviting ? 'Inviterer…' : 'Inviter'}
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              {ROLE_DESCRIPTIONS[inviteRole]}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-900">Afventende invitationer</h2>
            {invites.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Ingen afventende invitationer.</p>
            ) : (
              <>
              <div className="mt-4 space-y-3 md:hidden">
                {sortedInvites.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <p className="break-all font-medium text-slate-900">{i.email}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {ROLE_LABELS[i.role]}
                      </span>
                      <span className="text-slate-500">Sendt {formatDateTime(i.created_at)}</span>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => void deleteInvite(i.id, i.email)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Slet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-100 md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <SortableTh
                        label="E-mail"
                        isActive={inviteSortKey === 'email'}
                        direction={inviteSortKey === 'email' ? inviteSortDir : null}
                        onClick={() => onInviteSort('email')}
                      />
                      <SortableTh
                        label="Rolle"
                        isActive={inviteSortKey === 'role'}
                        direction={inviteSortKey === 'role' ? inviteSortDir : null}
                        onClick={() => onInviteSort('role')}
                      />
                      <SortableTh
                        label="Sendt"
                        isActive={inviteSortKey === 'sent'}
                        direction={inviteSortKey === 'sent' ? inviteSortDir : null}
                        onClick={() => onInviteSort('sent')}
                      />
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                        Handling
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedInvites.map((i) => (
                      <tr key={i.id} className="align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <span className="break-all">{i.email}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{ROLE_LABELS[i.role]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {formatDateTime(i.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteInvite(i.id, i.email)}
                            className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Slet
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </AppPageLayout>
  )
}

function StatCard({
  label,
  sublabel,
  value,
  tone,
}: {
  label: string
  sublabel: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'indigo'
}) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'indigo'
          ? 'text-indigo-700'
          : 'text-slate-700'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
    </div>
  )
}

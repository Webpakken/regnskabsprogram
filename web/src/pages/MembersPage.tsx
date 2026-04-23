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
}

type InviteRow = {
  id: string
  email: string
  role: CompanyRole
  created_at: string
}

const ROLES: CompanyRole[] = ['owner', 'manager', 'bookkeeper', 'accountant']

type MemberSortKey = 'name' | 'role' | 'added'
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
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('company_members')
        .select('id, user_id, role, created_at, profiles:profiles!inner(full_name)')
        .eq('company_id', currentCompany.id),
      canManage
        ? supabase
            .from('pending_invites')
            .select('id, email, role, created_at')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as InviteRow[], error: null }),
    ])

    const rawMembers = (membersRes.data ?? []) as unknown as Array<{
      id: string
      user_id: string
      role: CompanyRole
      created_at: string
      profiles: { full_name: string | null } | null
    }>
    setMembers(
      rawMembers.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        full_name: m.profiles?.full_name ?? null,
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

  async function cancelInvite(inviteId: string) {
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
    await load()
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Opret virksomhed først.</p>
  }

  return (
    <AppPageLayout maxWidth="3xl" className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Medlemmer</h1>
        <p className="text-sm text-slate-600">
          Inviter revisor, bogholder eller en anden ejer — og administrer roller.
        </p>
      </div>

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
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
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
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                    Handling
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedMembers.map((m) => {
                  const isSelf = m.user_id === user?.id
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
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
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
                            onClick={() => void cancelInvite(i.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Annuller
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </AppPageLayout>
  )
}

import { useCallback, useEffect, useState } from 'react'
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
    <div className="mx-auto max-w-3xl space-y-8">
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
          <ul className="mt-4 divide-y divide-slate-100">
            {members.map((m) => {
              const isSelf = m.user_id === user?.id
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {m.full_name?.trim() || 'Uden navn'}
                      {isSelf ? <span className="ml-2 text-xs text-slate-400">(dig)</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      Tilføjet {formatDateTime(m.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {ROLE_LABELS[m.role]}
                      </span>
                    )}
                    {canManage && !isSelf ? (
                      <button
                        type="button"
                        onClick={() => void removeMember(m.id, m.user_id)}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Fjern
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
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
              <ul className="mt-4 divide-y divide-slate-100">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{i.email}</div>
                      <div className="text-xs text-slate-500">
                        {ROLE_LABELS[i.role]} · sendt {formatDateTime(i.created_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void cancelInvite(i.id)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Annuller
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

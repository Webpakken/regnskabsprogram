import { useCallback, useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { invokeSmtpTest } from '@/lib/edge'
import { TRANSACTIONAL_SMTP_PROFILE_ID } from '@/lib/transactionalSmtp'

type SmtpProfile = Database['public']['Tables']['platform_smtp_profiles']['Row']

function stripSmtpPassword(rows: SmtpProfile[]): SmtpProfile[] {
  return rows.map(({ smtp_password: _p, ...rest }) => ({ ...rest, smtp_password: null }))
}

export function PlatformSmtpSettingsPage() {
  const { user } = useApp()
  const [smtp, setSmtp] = useState<SmtpProfile[]>([])
  /** Kun klient — sendes ved gem; vises aldrig tilbage fra API */
  const [passwordDraftById, setPasswordDraftById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('platform_smtp_profiles')
      .select('*')
      .order('id')
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setSmtp(stripSmtpPassword(data ?? []))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function seedProfiles() {
    setSeeding(true)
    setMessage(null)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('ensure_platform_smtp_profiles')
    setSeeding(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    setMessage('Standard SMTP-profiler er oprettet — udfyld felterne herunder.')
    void load()
  }

  async function saveSmtp(profile: SmtpProfile) {
    setSaving(true)
    setMessage(null)
    setError(null)
    const pwd = passwordDraftById[profile.id]?.trim()
    const payload: Record<string, unknown> = {
      host: profile.host || null,
      port: profile.port ?? null,
      user_name: profile.user_name || null,
      from_email: profile.from_email || null,
      from_name:
        profile.id === TRANSACTIONAL_SMTP_PROFILE_ID
          ? null
          : profile.from_name || null,
      updated_at: new Date().toISOString(),
    }
    if (pwd) {
      payload.smtp_password = pwd
    }
    const { error: uErr } = await supabase
      .from('platform_smtp_profiles')
      .update(payload)
      .eq('id', profile.id)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setPasswordDraftById((prev) => {
      const next = { ...prev }
      delete next[profile.id]
      return next
    })
    setMessage(
      pwd
        ? `SMTP «${profile.label}» opdateret (inkl. ny adgangskode).`
        : `SMTP «${profile.label}» opdateret.`,
    )
    void load()
  }

  if (loading) {
    return (
      <div className="text-center text-sm text-slate-500">Indlæser…</div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        Tre faste profiler. Profilen <strong>Faktura og kundemails</strong> bruger
        automatisk <strong>den enkelte virksomheds navn</strong> som afsendernavn til
        kunden — ikke et fast felt her. Adgangskode gemmes i databasen (kun platform-staff);
        efter gem vises den ikke igen.
      </p>

      {smtp.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p className="font-medium">Ingen SMTP-profiler i databasen endnu.</p>
          <p className="mt-2 text-amber-900/90">
            Kør den seneste migration, eller opret standardrækkerne her — derefter kan du
            indtaste host, port, bruger og afsender.
          </p>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void seedProfiles()}
            className="mt-4 rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950 disabled:opacity-50"
          >
            {seeding ? 'Opretter…' : 'Opret standard SMTP-profiler'}
          </button>
        </div>
      ) : null}

      <div className="space-y-6">
        {smtp.map((row) => (
          <SmtpCard
            key={row.id}
            profile={row}
            userEmail={user?.email}
            passwordDraft={passwordDraftById[row.id] ?? ''}
            onPasswordDraftChange={(v) =>
              setPasswordDraftById((d) => ({ ...d, [row.id]: v }))
            }
            saving={saving}
            onSave={() => void saveSmtp(row)}
            onChange={(next) =>
              setSmtp((list) => list.map((r) => (r.id === row.id ? next : r)))
            }
            onNotify={(kind, text) => {
              if (kind === 'success') {
                setMessage(text)
                setError(null)
              } else {
                setError(text)
                setMessage(null)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="text"
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

type SmtpProfileId = 'transactional' | 'platform' | 'marketing'

function SmtpCard({
  profile,
  userEmail,
  passwordDraft,
  onPasswordDraftChange,
  saving,
  onSave,
  onChange,
  onNotify,
}: {
  profile: SmtpProfile
  userEmail?: string | null
  passwordDraft: string
  onPasswordDraftChange: (v: string) => void
  saving: boolean
  onSave: () => void
  onChange: (p: SmtpProfile) => void
  onNotify: (kind: 'success' | 'error', text: string) => void
}) {
  const isTransactional = profile.id === TRANSACTIONAL_SMTP_PROFILE_ID
  const [testing, setTesting] = useState(false)

  async function runTest() {
    setTesting(true)
    try {
      await invokeSmtpTest(profile.id as SmtpProfileId)
      const dest = userEmail?.trim()
      onNotify(
        'success',
        dest
          ? `Testmail sendt til ${dest}.`
          : 'Testmail sendt til din kontos e-mail.',
      )
    } catch (e) {
      onNotify('error', e instanceof Error ? e.message : 'SMTP-test fejlede')
    } finally {
      setTesting(false)
    }
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="text-sm font-semibold text-slate-900">{profile.label}</div>
      <p className="text-xs text-slate-500">
        ID: <code className="rounded bg-slate-100 px-1">{profile.id}</code>
        {isTransactional ? (
          <span className="ml-2 text-indigo-700">
            — From-navn = virksomhed der sender fakturaen
          </span>
        ) : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Host"
          value={profile.host ?? ''}
          onChange={(v) => onChange({ ...profile, host: v })}
        />
        <div>
          <label className="text-xs font-medium text-slate-600">Port</label>
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={profile.port ?? ''}
            onChange={(e) =>
              onChange({
                ...profile,
                port: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        <Field
          label="Brugernavn"
          value={profile.user_name ?? ''}
          onChange={(v) => onChange({ ...profile, user_name: v })}
        />
        <div>
          <label className="text-xs font-medium text-slate-600">Adgangskode</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={passwordDraft}
            onChange={(e) => onPasswordDraftChange(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Tom = behold nuværende. Udfyld kun ved nyt kodeord.
          </p>
        </div>
        <Field
          label="From e-mail"
          value={profile.from_email ?? ''}
          onChange={(v) => onChange({ ...profile, from_email: v })}
        />
        {isTransactional ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2.5 sm:col-span-2">
            <div className="text-xs font-medium text-indigo-950">From navn (visning)</div>
            <p className="mt-1 text-sm leading-snug text-indigo-950/90">
              Sættes automatisk til <strong>den virksomheds navn</strong>, der sender
              fakturaen til kunden — ikke et fælles navn her i platformen.
            </p>
          </div>
        ) : (
          <Field
            label="From navn"
            className="sm:col-span-2"
            value={profile.from_name ?? ''}
            onChange={(v) => onChange({ ...profile, from_name: v })}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Gem profil
        </button>
        <button
          type="button"
          disabled={saving || testing}
          onClick={() => void runTest()}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
        >
          {testing ? 'Tester…' : 'Test'}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Testmail sendes til din platform-brugers e-mail. Kræver gemte SMTP-felter og
        adgangskode (eller ny adgangskode indtastet før gem).
      </p>
    </form>
  )
}

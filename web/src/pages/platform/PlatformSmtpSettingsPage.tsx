import { useCallback, useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'

type SmtpProfile = Database['public']['Tables']['platform_smtp_profiles']['Row']

export function PlatformSmtpSettingsPage() {
  const [smtp, setSmtp] = useState<SmtpProfile[]>([])
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
    setSmtp(data ?? [])
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
    const { error: uErr } = await supabase
      .from('platform_smtp_profiles')
      .update({
        host: profile.host || null,
        port: profile.port ?? null,
        user_name: profile.user_name || null,
        from_email: profile.from_email || null,
        from_name: profile.from_name || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setMessage(`SMTP «${profile.label}» opdateret (adgangskode sættes via Edge/secrets).`)
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
        Tre faste profiler (transactional / platform / marketing). Adgangskode
        gemmes ikke her — brug Supabase secrets eller Edge ved udsendelse.
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
            saving={saving}
            onSave={() => void saveSmtp(row)}
            onChange={(next) =>
              setSmtp((list) => list.map((r) => (r.id === row.id ? next : r)))
            }
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

function SmtpCard({
  profile,
  saving,
  onSave,
  onChange,
}: {
  profile: SmtpProfile
  saving: boolean
  onSave: () => void
  onChange: (p: SmtpProfile) => void
}) {
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
        ID: <code className="rounded bg-slate-100 px-1">{profile.id}</code> — adgangskode gemmes ikke her.
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
        <Field
          label="From e-mail"
          value={profile.from_email ?? ''}
          onChange={(v) => onChange({ ...profile, from_email: v })}
        />
        <Field
          label="From navn"
          className="sm:col-span-2"
          value={profile.from_name ?? ''}
          onChange={(v) => onChange({ ...profile, from_name: v })}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        Gem profil
      </button>
    </form>
  )
}

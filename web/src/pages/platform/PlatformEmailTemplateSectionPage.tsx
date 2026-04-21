import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_LABELS,
  type EmailTemplateBlock,
  type EmailTemplateKey,
  mergeEmailTemplates,
} from '@/lib/emailTemplateDefaults'
import { emailTemplateSlugToKey } from '@/lib/platformSettingsNav'
import { wrapBilagoEmailPreview } from '@/lib/emailPreview'
import { supabase } from '@/lib/supabase'

const ORDER: EmailTemplateKey[] = [
  'welcome_new_user',
  'password_reset',
  'company_member_invite',
  'invoice_sent',
]

export function PlatformEmailTemplateSectionPage() {
  const { templateSlug } = useParams<{ templateSlug: string }>()
  const { platformRole } = useApp()
  const templateKey = emailTemplateSlugToKey(templateSlug)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Record<EmailTemplateKey, EmailTemplateBlock>>(
    () => structuredClone(DEFAULT_EMAIL_TEMPLATES),
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('platform_public_settings')
      .select('email_templates')
      .eq('id', 1)
      .maybeSingle()
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setTemplates(mergeEmailTemplates(data?.email_templates))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)
    const payload = ORDER.reduce(
      (acc, k) => {
        acc[k] = templates[k]
        return acc
      },
      {} as Record<EmailTemplateKey, EmailTemplateBlock>,
    )
    const { error: uErr } = await supabase
      .from('platform_public_settings')
      .update({
        email_templates: payload as unknown as Record<string, never>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setMessage('Skabelon gemt.')
    await load()
  }

  function patchKey(key: EmailTemplateKey, patch: Partial<EmailTemplateBlock>) {
    setTemplates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function resetKey(key: EmailTemplateKey) {
    setTemplates((prev) => ({
      ...prev,
      [key]: { ...structuredClone(DEFAULT_EMAIL_TEMPLATES[key]) },
    }))
  }

  const previews = useMemo(() => {
    const demo: Record<EmailTemplateKey, Record<string, string>> = {
      welcome_new_user: {
        user_name: 'Test Bruger',
        login_url: 'https://bilago.dk/login',
      },
      password_reset: {
        user_email: 'dig@eksempel.dk',
        reset_link: 'https://bilago.dk/login#recovery',
      },
      company_member_invite: {
        company_name: 'Eksempel ApS',
        role_label: 'Bogholder',
        invitee_email: 'ny@eksempel.dk',
        signup_url: 'https://bilago.dk/signup',
      },
      invoice_sent: {
        customer_name: 'Kunde A/S',
        invoice_number: '000042',
        gross_amount: '1.250,00 kr.',
        due_date: '1. maj 2026',
        company_name: 'Eksempel ApS',
        notes_block:
          '<p style="margin:12px 0 0;color:#475569;font-size:14px;">Ekstra bemærkning fra fakturaen.</p>',
      },
    }
    const out: Partial<Record<EmailTemplateKey, string>> = {}
    for (const key of ORDER) {
      let inner = templates[key].html
      const vars = demo[key]
      for (const [k, v] of Object.entries(vars)) {
        inner = inner.split(`{{${k}}}`).join(v)
      }
      out[key] = wrapBilagoEmailPreview(inner, templates[key].subject)
    }
    return out
  }, [templates])

  if (platformRole !== 'superadmin') {
    return <Navigate to="/platform/dashboard" replace />
  }

  if (!templateKey) {
    return <Navigate to="/platform/settings/emails/velkomst-ny-bruger" replace />
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500">Indlæser…</div>
  }

  const meta = EMAIL_TEMPLATE_LABELS[templateKey]
  const block = templates[templateKey]

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

      <div className="rounded-xl border border-slate-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
        <strong className="font-semibold">SMTP:</strong> Skabeloner sendes via jeres konfigurerede
        profiler under <span className="font-mono text-xs">Indstillinger → SMTP</span>.
      </div>

      <form
        onSubmit={(e) => void save(e)}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="max-w-prose text-xs text-slate-600">{meta.description}</p>
            <p className="mt-2 font-mono text-[11px] text-slate-500">{meta.placeholders}</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-medium text-slate-700"
              id={`email-template-active-${templateKey}`}
            >
              Aktiv
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={block.enabled}
              aria-labelledby={`email-template-active-${templateKey}`}
              onClick={() => patchKey(templateKey, { enabled: !block.enabled })}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                block.enabled ? 'justify-end bg-indigo-600' : 'justify-start bg-slate-200'
              }`}
            >
              <span
                aria-hidden
                className="pointer-events-none h-6 w-6 rounded-full bg-white shadow transition-[margin] duration-200 ease-in-out"
              />
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Emne</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={block.subject}
                onChange={(e) => patchKey(templateKey, { subject: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">HTML-indhold (krop)</label>
              <textarea
                className="mt-1 min-h-[280px] w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                value={block.html}
                onChange={(e) => patchKey(templateKey, { html: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => resetKey(templateKey)}
            >
              Gendan standard for denne skabelon
            </button>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600">Forhåndsvisning (demo-data)</p>
            <iframe
              title={`Forhåndsvisning ${templateKey}`}
              className="mt-1 h-[min(480px,55vh)] w-full rounded-lg border border-slate-200 bg-slate-100"
              srcDoc={previews[templateKey] ?? ''}
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Gemmer…' : 'Gem skabelon'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'

const ACCEPT_LOGO = 'image/png,image/jpeg,image/jpg'

export function SettingsInvoicePage() {
  const { currentCompany, refresh } = useApp()
  const [attachPdf, setAttachPdf] = useState(true)
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [invoicePhone, setInvoicePhone] = useState('')
  const [invoiceWebsite, setInvoiceWebsite] = useState('')
  const [bankReg, setBankReg] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [iban, setIban] = useState('')
  const [footerNote, setFooterNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  useEffect(() => {
    if (currentCompany) {
      setAttachPdf(currentCompany.invoice_attach_pdf_to_email !== false)
      setInvoiceEmail(currentCompany.invoice_email ?? '')
      setInvoicePhone(currentCompany.invoice_phone ?? '')
      setInvoiceWebsite(currentCompany.invoice_website ?? '')
      setBankReg(currentCompany.bank_reg_number ?? '')
      setBankAccount(currentCompany.bank_account_number ?? '')
      setIban(currentCompany.iban ?? '')
      setFooterNote(currentCompany.invoice_footer_note ?? '')
    }
  }, [currentCompany])

  useEffect(() => {
    let cancelled = false
    const path = currentCompany?.invoice_logo_path
    if (!path?.trim()) {
      setLogoPreview(null)
      return
    }
    void supabase.storage
      .from('company-logos')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setLogoPreview(data.signedUrl)
      })
    return () => {
      cancelled = true
    }
  }, [currentCompany?.invoice_logo_path])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!currentCompany) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const { error: saveErr } = await supabase
      .from('companies')
      .update({
        invoice_attach_pdf_to_email: attachPdf,
        invoice_email: invoiceEmail.trim() || null,
        invoice_phone: invoicePhone.trim() || null,
        invoice_website: invoiceWebsite.trim() || null,
        bank_reg_number: bankReg.trim() || null,
        bank_account_number: bankAccount.trim() || null,
        iban: iban.trim() || null,
        invoice_footer_note: footerNote.trim() || null,
      })
      .eq('id', currentCompany.id)
    setSaving(false)
    if (saveErr) {
      setError(saveErr.message)
      return
    }
    setMessage('Faktura-indstillinger gemt.')
    await refresh()
  }

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentCompany) return
    if (!file.type.startsWith('image/')) {
      setError('Logo skal være PNG eller JPEG.')
      return
    }
    setLogoBusy(true)
    setError(null)
    const ext = file.name.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const path = `${currentCompany.id}/logo-${crypto.randomUUID()}.${ext}`
    const oldPath = currentCompany.invoice_logo_path
    const { error: upErr } = await supabase.storage
      .from('company-logos')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (upErr) {
      setError(upErr.message)
      setLogoBusy(false)
      return
    }
    const { error: dbErr } = await supabase
      .from('companies')
      .update({ invoice_logo_path: path })
      .eq('id', currentCompany.id)
    if (dbErr) {
      setError(dbErr.message)
      await supabase.storage.from('company-logos').remove([path])
      setLogoBusy(false)
      return
    }
    if (oldPath && oldPath !== path) {
      await supabase.storage.from('company-logos').remove([oldPath])
    }
    setLogoBusy(false)
    setMessage('Logo opdateret.')
    await refresh()
  }

  async function removeLogo() {
    if (!currentCompany?.invoice_logo_path) return
    setLogoBusy(true)
    setError(null)
    const path = currentCompany.invoice_logo_path
    const { error: dbErr } = await supabase
      .from('companies')
      .update({ invoice_logo_path: null })
      .eq('id', currentCompany.id)
    if (dbErr) {
      setError(dbErr.message)
      setLogoBusy(false)
      return
    }
    await supabase.storage.from('company-logos').remove([path])
    setLogoBusy(false)
    setMessage('Logo fjernet.')
    await refresh()
  }

  if (!currentCompany) {
    return (
      <p className="text-slate-600">Opret virksomhed under onboarding først.</p>
    )
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void save(e)}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Faktura og e-mail</h2>
        <p className="text-sm text-slate-600">
          Det, der vises på PDF-fakturaen og i kommunikation med kunden. Virksomhedsnavn og adresse
          findes under fanen Generelt.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
          />
          <span>
            <span className="text-sm font-medium text-slate-900">
              Vedhæft faktura som PDF i e-mail til kunden
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Når en faktura sendes pr. e-mail, medfølger PDF som standard. Slå fra, hvis I kun vil
              sende teksten i mailen.
            </span>
          </span>
        </label>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Logo på faktura</h3>
          <p className="mt-1 text-xs text-slate-600">PNG eller JPEG — anbefalet bredde ca. 800 px.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt=""
                className="h-14 max-w-[200px] rounded border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <span className="text-sm text-slate-500">Intet logo</span>
            )}
            <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
              {logoBusy ? 'Arbejder…' : 'Vælg logo'}
              <input
                type="file"
                accept={ACCEPT_LOGO}
                className="hidden"
                disabled={logoBusy}
                onChange={(e) => void onLogoSelected(e)}
              />
            </label>
            {currentCompany.invoice_logo_path ? (
              <button
                type="button"
                disabled={logoBusy}
                className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
                onClick={() => void removeLogo()}
              >
                Fjern logo
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="invemail">
              E-mail (på faktura)
            </label>
            <input
              id="invemail"
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={invoiceEmail}
              onChange={(e) => setInvoiceEmail(e.target.value)}
              placeholder="faktura@virksomhed.dk"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="invphone">
              Telefon
            </label>
            <input
              id="invphone"
              type="tel"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={invoicePhone}
              onChange={(e) => setInvoicePhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="invweb">
              Hjemmeside
            </label>
            <input
              id="invweb"
              type="url"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={invoiceWebsite}
              onChange={(e) => setInvoiceWebsite(e.target.value)}
              placeholder="https://"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Bank (vises på faktura)</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="breg">
                Reg.nr.
              </label>
              <input
                id="breg"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={bankReg}
                onChange={(e) => setBankReg(e.target.value)}
                placeholder="1234"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="bacc">
                Kontonr.
              </label>
              <input
                id="bacc"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="iban">
                IBAN (valgfrit)
              </label>
              <input
                id="iban"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="DK50 0040 0440 1162 43"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="foot">
            Bundtekst på faktura (valgfrit)
          </label>
          <textarea
            id="foot"
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            placeholder="Fx betalingsbetingelser eller fodnote."
          />
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

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Gemmer…' : 'Gem faktura-indstillinger'}
        </button>
      </form>
    </div>
  )
}

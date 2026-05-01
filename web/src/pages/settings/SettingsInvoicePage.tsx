import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'

const ACCEPT_LOGO = 'image/png,image/jpeg,image/jpg'

export function SettingsInvoicePage() {
  const { currentCompany, currentRole, refresh } = useApp()
  const canEdit = currentRole === 'owner'
  const [attachPdf, setAttachPdf] = useState(true)
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [invoicePhone, setInvoicePhone] = useState('')
  const [invoiceWebsite, setInvoiceWebsite] = useState('')
  const [bankReg, setBankReg] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [iban, setIban] = useState('')
  const [footerNote, setFooterNote] = useState('')
  const [invoiceStartingNumber, setInvoiceStartingNumber] = useState(1)
  const [invoiceDigitWidth, setInvoiceDigitWidth] = useState(4)
  const [automationEnabled, setAutomationEnabled] = useState(false)
  const [automationFirstDaysAfterDue, setAutomationFirstDaysAfterDue] = useState(1)
  const [automationIntervalDays, setAutomationIntervalDays] = useState(7)
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [invoiceSeriesStarted, setInvoiceSeriesStarted] = useState<boolean | null>(
    null,
  )

  // Initialiser felter når brugeren skifter til en anden virksomhed.
  // Lyt KUN på id (ikke hele currentCompany), så et baggrunds-refresh fra AppProvider
  // — fx ved tab-skift / TOKEN_REFRESHED — ikke overskriver ugemte ændringer.
  const hydratedForCompanyId = useRef<string | null>(null)
  useEffect(() => {
    if (!currentCompany) {
      hydratedForCompanyId.current = null
      return
    }
    if (hydratedForCompanyId.current === currentCompany.id) return
    hydratedForCompanyId.current = currentCompany.id
    setAttachPdf(currentCompany.invoice_attach_pdf_to_email !== false)
    setInvoiceEmail(currentCompany.invoice_email ?? '')
    setInvoicePhone(currentCompany.invoice_phone ?? '')
    setInvoiceWebsite(currentCompany.invoice_website ?? '')
    setBankReg(currentCompany.bank_reg_number ?? '')
    setBankAccount(currentCompany.bank_account_number ?? '')
    setIban(currentCompany.iban ?? '')
    setFooterNote(currentCompany.invoice_footer_note ?? '')
    setInvoiceStartingNumber(
      typeof currentCompany.invoice_starting_number === 'number'
        ? currentCompany.invoice_starting_number
        : 1,
    )
    setInvoiceDigitWidth(
      typeof currentCompany.invoice_number_digit_width === 'number'
        ? currentCompany.invoice_number_digit_width
        : 4,
    )
    setAutomationEnabled(currentCompany.automation_reminders_enabled === true)
    setAutomationFirstDaysAfterDue(
      typeof currentCompany.automation_reminder_first_days_after_due === 'number'
        ? currentCompany.automation_reminder_first_days_after_due
        : 1,
    )
    setAutomationIntervalDays(
      typeof currentCompany.automation_reminder_interval_days === 'number'
        ? currentCompany.automation_reminder_interval_days
        : 7,
    )
  }, [currentCompany])

  useEffect(() => {
    if (!currentCompany?.id) {
      setInvoiceSeriesStarted(null)
      return
    }
    let cancelled = false
    void supabase
      .from('invoice_number_seq')
      .select('last_value')
      .eq('company_id', currentCompany.id)
      .maybeSingle()
      .then(({ data, error: seqError }) => {
        if (cancelled) return
        setInvoiceSeriesStarted(seqError ? null : Boolean(data))
      })
    return () => {
      cancelled = true
    }
  }, [currentCompany?.id])

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
    if (!currentCompany || !canEdit) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const start = Math.max(1, Math.floor(Number(invoiceStartingNumber)) || 1)
    const width = Math.min(12, Math.max(2, Math.floor(Number(invoiceDigitWidth)) || 4))
    const firstDays = Math.min(
      365,
      Math.max(0, Math.floor(Number(automationFirstDaysAfterDue)) || 0),
    )
    const intervalDays = Math.min(
      365,
      Math.max(1, Math.floor(Number(automationIntervalDays)) || 7),
    )
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
        ...(invoiceSeriesStarted
          ? {}
          : {
              invoice_starting_number: start,
              invoice_number_digit_width: width,
            }),
        automation_reminders_enabled: automationEnabled,
        automation_reminder_first_days_after_due: firstDays,
        automation_reminder_interval_days: intervalDays,
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
    if (!file || !currentCompany || !canEdit) return
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
    if (!currentCompany?.invoice_logo_path || !canEdit) return
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
      {!canEdit ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Kun ejeren af virksomheden kan ændre faktura-indstillinger. Du kan se de nuværende værdier herunder.
        </p>
      ) : null}

      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-slate-900">Importér fra gammel platform</h2>
              <p className="mt-1 text-sm text-slate-600">
                Skifter du fra Dinero, Billy, e-conomic eller et andet system? Træk PDF-fakturaer
                ind, så læser vi dem automatisk og gemmer både data og PDF i Bilago. Vi sætter
                næste fakturanummer korrekt så der ikke opstår konflikter.
              </p>
            </div>
            <Link
              to="/app/invoices/import"
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Importér fakturaer
            </Link>
          </div>
        </section>
      ) : null}
      <form
        onSubmit={(e) => void save(e)}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Faktura og e-mail</h2>
        <p className="mt-2 text-sm text-slate-600">
          Det, der vises på PDF-fakturaen og i kommunikation med kunden. Virksomhedsnavn og adresse
          findes under fanen Generelt.
        </p>
        <fieldset
          disabled={!canEdit}
          className="m-0 mt-5 min-w-0 space-y-5 border-0 p-0 disabled:opacity-70"
        >
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
          <h3 className="text-sm font-semibold text-slate-900">Fakturanummer</h3>
          <p className="mt-1 text-xs text-slate-600">
            Første nummer bruges når serien oprettes ved jeres første faktura. Efterfølgende
            fortsætter nummerserien automatisk. Antal cifre styrer fx 0001 mod 000001.
          </p>
          {invoiceSeriesStarted === true ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Fakturaserien er allerede startet. Startnummer og minimum cifre er derfor låst,
              så fakturanumrene forbliver fortløbende.
            </p>
          ) : invoiceSeriesStarted === false ? (
            <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              Når du opretter virksomhedens første faktura eller kladde, bliver serien låst.
              Du får også en påmindelse i faktura-flowet inden første oprettelse.
            </p>
          ) : (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Kontrollerer om fakturaserien allerede er startet…
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="invstart">
                Start ved nummer
              </label>
              <input
                id="invstart"
                type="number"
                min={1}
                step={1}
                disabled={invoiceSeriesStarted === true}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={invoiceStartingNumber}
                onChange={(e) => setInvoiceStartingNumber(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="invdigits">
                Minimum cifre (2–12)
              </label>
              <input
                id="invdigits"
                type="number"
                min={2}
                max={12}
                step={1}
                disabled={invoiceSeriesStarted === true}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={invoiceDigitWidth}
                onChange={(e) => setInvoiceDigitWidth(Number(e.target.value))}
              />
            </div>
          </div>
          {invoiceSeriesStarted === false ? (
            <Link
              to="/app/invoices/new"
              className="mt-3 inline-flex text-xs font-medium text-indigo-600"
            >
              Opret første faktura
            </Link>
          ) : null}
        </div>

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

        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Automatiske påmindelser</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Bruger skabelonen <strong className="font-medium text-slate-800">Betalingspåmindelse</strong> til kundens
            e-mail på faste tidspunkter for fakturaer med status <em>Sendt</em> (ikke betalt), uden kreditnota og med
            udfyldt kundemail. Manuel «Send påmindelse» fra fakturaen styrer ikke denne plan. Maks. 24 automatiske
            pr. faktura. I er ansvarlige for gældende inkasso- og markedsføringsregler — få juridisk rådgivning ved
            tvivl.
          </p>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={automationEnabled}
              onChange={(e) => setAutomationEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-800">Slå automatiske påmindelser til</span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="autoFirst">
                Første påmindelse (dage efter forfald)
              </label>
              <input
                id="autoFirst"
                type="number"
                min={0}
                max={365}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={automationFirstDaysAfterDue}
                onChange={(e) => setAutomationFirstDaysAfterDue(Number(e.target.value))}
                disabled={!automationEnabled}
              />
              <p className="mt-1 text-xs text-slate-500">0 = samme kalenderdag som forfaldsdato.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="autoInterval">
                Derefter hver (antal dage)
              </label>
              <input
                id="autoInterval"
                type="number"
                min={1}
                max={365}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={automationIntervalDays}
                onChange={(e) => setAutomationIntervalDays(Number(e.target.value))}
                disabled={!automationEnabled}
              />
              <p className="mt-1 text-xs text-slate-500">Minimum ét døgn mellem hver automatiske udsendelse.</p>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            Når automatiske påmindelser er slået til, tjekker Bilago løbende
            for forfaldne sendte fakturaer og sender påmindelser efter planen.
          </p>
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
        </fieldset>
      </form>
    </div>
  )
}

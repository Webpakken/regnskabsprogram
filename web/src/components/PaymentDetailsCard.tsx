import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_PAYMENT_INFO,
  FIK_PAYMENT_ID_MAX_LENGTH,
  derivePaymentMethod,
  fikPaymentIdPassesMod10,
  hasPaymentInfo,
  parseFikLine,
  type FikLineParts,
  type VoucherPaymentInfo,
} from '@/lib/paymentDetails'

/**
 * Viser betalingsoplysninger udlæst af et bilag med kopiér-knapper, så
 * FIK-linjen eller kontonummeret kan indsættes direkte i netbanken.
 *
 * Værdierne vises i monospace: brugeren skal kunne sammenligne ciffer for
 * ciffer med papiret, og proportional skrift gør 1/7 og 0/8 svære at skelne.
 *
 * Sæt `onChange` for at gøre kortet redigerbart — AI-udlæsningen rammer ikke
 * altid rigtigt, og et kontonummer skal kunne rettes uden at scanne igen.
 */
export function PaymentDetailsCard({
  payment,
  uncertain = false,
  className = '',
  onChange,
  saving = false,
}: {
  payment: VoucherPaymentInfo
  /** Sæt når AI'en selv flaggede betalingsoplysningerne som usikre. */
  uncertain?: boolean
  className?: string
  /** Kaldes med hele det nye feltsæt når brugeren gemmer en rettelse. */
  onChange?: (next: VoucherPaymentInfo) => void
  saving?: boolean
}) {
  const [editing, setEditing] = useState(false)

  if (editing && onChange) {
    return (
      <PaymentDetailsEditor
        payment={payment}
        className={className}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          onChange(next)
          setEditing(false)
        }}
      />
    )
  }

  const fik = payment.fikLine ? parseFikLine(payment.fikLine) : null
  const bankAccount =
    payment.bankRegNo && payment.bankAccountNo
      ? `${payment.bankRegNo} ${payment.bankAccountNo}`
      : null

  if (!hasPaymentInfo(payment)) {
    // Uden redigering er et tomt kort bare støj; med redigering er det
    // indgangen til at taste oplysningerne selv.
    if (!onChange) return null
    return (
      <section
        className={`rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 ${className}`}
        aria-label="Betalingsoplysninger"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Betalingsoplysninger
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Ingen fundet på bilaget. Tilføj dem selv, hvis regningen skal betales.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Tilføj betalingsoplysninger
        </button>
      </section>
    )
  }

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white px-3 py-3 ${className}`}
      aria-label="Betalingsoplysninger"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Betalingsoplysninger
        </h3>
        <div className="flex items-center gap-2">
          {payment.dueDate ? (
            <span className="text-xs text-slate-500">
              Forfald {formatDanishDate(payment.dueDate)}
            </span>
          ) : null}
          {onChange ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ret
            </button>
          ) : null}
        </div>
      </div>

      {uncertain ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          Tjek tallene mod bilaget før du betaler — de kunne ikke aflæses med
          sikkerhed.
        </p>
      ) : null}

      {fik ? <FikCopySteps parts={fik} /> : null}

      <dl className="mt-2 space-y-2">
        {bankAccount ? <CopyRow label="Reg.nr. og konto" value={bankAccount} /> : null}
        {payment.iban ? <CopyRow label="IBAN" value={payment.iban} /> : null}
        {payment.paymentReference ? (
          <CopyRow label="Betalingsreference" value={payment.paymentReference} />
        ) : null}
      </dl>
    </section>
  )
}

/**
 * FIK-linjen tastes i netbanken som to felter i fast rækkefølge: først
 * betalingsid, så kreditornummer. Derfor er hvert felt sin egen knap med et
 * trinnummer — brugeren trykker på det første tal, taster det i banken, og
 * trykker så på det næste. Ét langt kopiér-alt gav ingen hjælp til den flow.
 */
function FikCopySteps({ parts }: { parts: FikLineParts }) {
  const [done, setDone] = useState<string[]>([])
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current)
    }
  }, [])

  const steps = useMemo(() => {
    const list: Array<{ key: string; label: string; value: string }> = []
    // Kortart 01 har intet betalingsid — så er kreditornummeret eneste trin.
    if (parts.paymentId) {
      list.push({ key: 'paymentId', label: 'Betalingsid', value: parts.paymentId })
    }
    list.push({ key: 'creditorNo', label: 'Kreditornr.', value: parts.creditorNo })
    return list
  }, [parts])

  const nextKey = steps.find((s) => !done.includes(s.key))?.key ?? null
  // Løftet ud, så TS bevarer narrowingen inde i onCopy-closuren nedenfor.
  const paymentId = parts.paymentId

  const copyStep = useCallback(async (key: string, value: string) => {
    if (!(await copyText(value))) return
    setDone((prev) => (prev.includes(key) ? prev : [...prev, key]))
    // Nulstil efter et stykke tid, så kortet er klar til næste betaling
    // i stedet for at stå med alle trin hakket af.
    if (resetRef.current) clearTimeout(resetRef.current)
    resetRef.current = setTimeout(() => setDone([]), 20000)
  }, [])

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          Indbetalingskort (kortart {parts.cardType})
        </span>
        <CopyButton
          label="Kopiér hele linjen"
          value={parts.line}
          className="text-[11px]"
        />
      </div>

      <div className="mt-1 flex flex-wrap items-stretch gap-1 rounded-lg bg-slate-50 p-1.5">
        <span className="self-center px-1 font-mono text-sm text-slate-400">
          +{parts.cardType}&lt;
        </span>
        {paymentId ? (
          <FikStepButton
            step={1}
            label="Betalingsid"
            value={paymentId}
            copied={done.includes('paymentId')}
            isNext={nextKey === 'paymentId'}
            onCopy={() => void copyStep('paymentId', paymentId)}
          />
        ) : null}
        <span className="self-center px-1 font-mono text-sm text-slate-400">+</span>
        <FikStepButton
          step={paymentId ? 2 : 1}
          label="Kreditornr."
          value={parts.creditorNo}
          copied={done.includes('creditorNo')}
          isNext={nextKey === 'creditorNo'}
          onCopy={() => void copyStep('creditorNo', parts.creditorNo)}
        />
        <span className="self-center px-1 font-mono text-sm text-slate-400">&lt;</span>
      </div>

      <p className="mt-1 text-[11px] text-slate-500" aria-live="polite">
        {nextKey === null
          ? 'Begge felter kopieret — tjek dem mod bilaget før du godkender.'
          : done.length === 0
            ? 'Tryk på det første tal, indsæt det i netbanken, og tryk så på det næste.'
            : 'Kopieret. Tryk nu på det næste tal.'}
      </p>
    </div>
  )
}

function FikStepButton({
  step,
  label,
  value,
  copied,
  isNext,
  onCopy,
}: {
  step: number
  label: string
  value: string
  copied: boolean
  isNext: boolean
  onCopy: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      // Cifrene læses enkeltvis op, så en skærmlæser ikke siger "tolv millioner".
      aria-label={`Trin ${step}: kopiér ${label} ${value.split('').join(' ')}`}
      className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
        copied
          ? 'border-emerald-300 bg-emerald-50'
          : isNext
            ? 'border-indigo-400 bg-white ring-2 ring-indigo-100'
            : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          copied ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
        }`}
        aria-hidden="true"
      >
        {copied ? '✓' : step}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span className="block break-all font-mono text-sm font-semibold text-slate-900">
          {groupDigits(value)}
        </span>
      </span>
    </button>
  )
}

/** "0000 0000 0012 3456" — grupper à fire gør ciffer-for-ciffer-tjek muligt. */
function groupDigits(value: string): string {
  return value.replace(/(.{4})(?=.)/g, '$1 ')
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-slate-500">{label}</dt>
        <dd className="truncate font-mono text-sm text-slate-900" title={value}>
          {value}
        </dd>
      </div>
      <CopyButton label={`Kopiér ${label}`} value={value} srOnlyLabel />
    </div>
  )
}

function CopyButton({
  label,
  value,
  className = '',
  srOnlyLabel = false,
}: {
  label: string
  value: string
  className?: string
  srOnlyLabel?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(async () => {
    const ok = await copyText(value)
    if (!ok) return
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1800)
  }, [value])

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      className={`shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 ${className}`}
    >
      {copied ? 'Kopieret' : srOnlyLabel ? 'Kopiér' : label}
    </button>
  )
}

function PaymentDetailsEditor({
  payment,
  className = '',
  saving,
  onCancel,
  onSave,
}: {
  payment: VoucherPaymentInfo
  className?: string
  saving: boolean
  onCancel: () => void
  onSave: (next: VoucherPaymentInfo) => void
}) {
  const [fikLine, setFikLine] = useState(payment.fikLine ?? '')
  const [regNo, setRegNo] = useState(payment.bankRegNo ?? '')
  const [accountNo, setAccountNo] = useState(payment.bankAccountNo ?? '')
  const [iban, setIban] = useState(payment.iban ?? '')
  const [reference, setReference] = useState(payment.paymentReference ?? '')
  const [dueDate, setDueDate] = useState(payment.dueDate ?? '')
  const [error, setError] = useState<string | null>(null)

  const fikPreview = fikLine.trim() ? parseFikLine(fikLine.trim()) : null
  const mod10Warning = Boolean(
    fikPreview?.paymentId &&
      fikPreview.paymentId.length === FIK_PAYMENT_ID_MAX_LENGTH &&
      !fikPaymentIdPassesMod10(fikPreview.paymentId),
  )

  function submit() {
    const fikRaw = fikLine.trim()
    const fik = fikRaw ? parseFikLine(fikRaw) : null
    if (fikRaw && !fik) {
      setError(
        'FIK-linjen kunne ikke læses. Formen er +NN<betalingsid+kreditornummer< med 8 cifre i kreditornummeret.',
      )
      return
    }
    const reg = regNo.replace(/\D/g, '')
    const account = accountNo.replace(/\D/g, '')
    if (reg && reg.length !== 4) {
      setError('Reg.nr. skal være 4 cifre.')
      return
    }
    if (account && account.length > 10) {
      setError('Kontonummer kan højst være 10 cifre.')
      return
    }
    if (Boolean(reg) !== Boolean(account)) {
      setError('Både reg.nr. og kontonummer skal udfyldes — ellers kan der ikke overføres.')
      return
    }
    const ibanCompact = iban.replace(/\s+/g, '').toUpperCase()
    if (ibanCompact && !/^DK\d{16}$/.test(ibanCompact)) {
      setError('Dansk IBAN er DK efterfulgt af 16 cifre.')
      return
    }

    const next: VoucherPaymentInfo = {
      ...EMPTY_PAYMENT_INFO,
      fikLine: fik?.line ?? null,
      fikCardType: fik?.cardType ?? null,
      fikPaymentId: fik?.paymentId ?? null,
      fikCreditorNo: fik?.creditorNo ?? null,
      bankRegNo: reg || null,
      bankAccountNo: account || null,
      iban: ibanCompact || null,
      paymentReference: reference.trim() || null,
      dueDate: dueDate || null,
      // Bevares så en manuelt indtastet MobilePay-boks ikke går tabt;
      // derivePaymentMethod nedenfor retter den til hvis felterne siger andet.
      paymentMethod: payment.paymentMethod,
    }
    onSave({ ...next, paymentMethod: derivePaymentMethod(next) })
  }

  return (
    <section
      className={`rounded-xl border border-indigo-200 bg-white px-3 py-3 ${className}`}
      aria-label="Ret betalingsoplysninger"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Ret betalingsoplysninger
      </h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Tjek hvert ciffer mod bilaget. Et forkert tal sender pengene det forkerte
        sted hen.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <EditField
            label="FIK-linje (indbetalingskort)"
            value={fikLine}
            onChange={setFikLine}
            placeholder="+71<0000000000123455+12345678<"
            mono
          />
          {mod10Warning ? (
            // Advarsel frem for blokering: kontrolcifferet er standard på de
            // kortarter vi kender, men vi vil ikke afvise en linje brugeren
            // kan se med egne øjne på bilaget.
            <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              Kontrolcifferet i betalingsid passer ikke. Tjek cifrene igen — det
              er typisk ét forvekslet tal (1/7, 3/8, 5/6 eller 0/8).
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <EditField
            label="Reg.nr."
            value={regNo}
            onChange={setRegNo}
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
            mono
          />
          <EditField
            label="Kontonummer"
            value={accountNo}
            onChange={setAccountNo}
            placeholder="5678901234"
            inputMode="numeric"
            maxLength={10}
            mono
          />
        </div>
        <EditField
          label="IBAN"
          value={iban}
          onChange={setIban}
          placeholder="DK5000400440116243"
          mono
        />
        <EditField
          label="Betalingsreference (posteringstekst)"
          value={reference}
          onChange={setReference}
          placeholder="Fakturanr. 10432"
        />
        <label className="block text-[11px] text-slate-500">
          Forfaldsdato
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Gemmer…' : 'Gem'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Annullér
        </button>
      </div>
    </section>
  )
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
  mono = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'numeric' | 'text'
  maxLength?: number
  mono?: boolean
}) {
  return (
    <label className="block text-[11px] text-slate-500">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        className={`mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  )
}

/**
 * navigator.clipboard kræver secure context og fejler i visse in-app-browsere.
 * Faldet tilbage til execCommand holder knappen brugbar der.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* falder igennem til fallback herunder */
  }
  try {
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

function formatDanishDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

import clsx from 'clsx'

type CheckoutResultNoticeProps = {
  result: string | null
  className?: string
}

export function CheckoutResultNotice({ result, className }: CheckoutResultNoticeProps) {
  if (!result) return null

  const normalized = result.toLowerCase()
  const config =
    normalized === 'success'
      ? {
          tone: 'emerald',
          title: 'Betaling gennemført',
          text:
            'Stripe har modtaget betalingen. Abonnementet aktiveres automatisk, når bekræftelsen er behandlet.',
        }
      : normalized === 'cancel'
        ? {
            tone: 'amber',
            title: 'Betaling annulleret',
            text: 'Du afbrød betalingen i Stripe. Du kan prøve igen, når du er klar.',
          }
        : {
            tone: 'rose',
            title: 'Betaling fejlede',
            text:
              'Stripe kunne ikke gennemføre betalingen. Prøv igen, eller brug et andet betalingskort.',
          }

  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm',
        config.tone === 'emerald' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
        config.tone === 'amber' && 'border-amber-200 bg-amber-50 text-amber-900',
        config.tone === 'rose' && 'border-rose-200 bg-rose-50 text-rose-900',
        className,
      )}
      role={config.tone === 'rose' ? 'alert' : 'status'}
    >
      <p className="font-semibold">{config.title}</p>
      <p className="mt-1 text-current/80">{config.text}</p>
    </div>
  )
}

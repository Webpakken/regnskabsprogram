import clsx from 'clsx'
import { BrandMark } from '@/components/BrandMark'

type BrandLogoProps = {
  className?: string
  variant?: 'header' | 'footer'
}

/**
 * Marketing-logo uden sort PNG-baggrund: lilla app-ikon + «Bilago» + pay-off (som i brand-manualen).
 * (`/public/bilago-logo.png` kan bruges andre steder, når I har gennemsigtig baggrund.)
 */
export function BrandLogo({ className, variant = 'header' }: BrandLogoProps) {
  return (
    <span
      className={clsx('flex min-w-0 items-center gap-2.5', className)}
    >
      <BrandMark className="shrink-0" size={variant === 'footer' ? 'md' : 'sm'} />
      <span
        className={clsx(
          'flex min-w-0 flex-col leading-tight',
          variant === 'footer' && 'gap-0.5',
        )}
      >
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          Bilago<span className="font-medium text-slate-400">.dk</span>
        </span>
        <span
          className={clsx(
            'text-[11px] text-slate-500',
            variant === 'header' && 'hidden sm:block',
            variant === 'footer' && 'whitespace-nowrap text-xs',
          )}
        >
          Enkelt regnskab. Fuldt overblik.
        </span>
      </span>
    </span>
  )
}

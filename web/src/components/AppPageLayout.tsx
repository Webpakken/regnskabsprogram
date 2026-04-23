import type { ReactNode } from 'react'
import clsx from 'clsx'

/** Max-bredde som på Medlemmer (3xl), Indstillinger/Support (2xl), oversigt/fakturaer (6xl). */
export type AppMaxWidth = '2xl' | '3xl' | '6xl'

const maxWidthClass: Record<AppMaxWidth, string> = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '6xl': 'max-w-6xl',
}

/**
 * Fælles app-side: centreret indhold med luft til viewport-kanter (samme mønster som Medlemmer).
 * Bruges inde i AppShell `main`, der allerede har horisontal padding.
 */
export function AppPageLayout({
  children,
  maxWidth = '6xl',
  className,
}: {
  children: ReactNode
  maxWidth?: AppMaxWidth
  className?: string
}) {
  return (
    <div className={clsx('mx-auto w-full', maxWidthClass[maxWidth], className)}>{children}</div>
  )
}

/** Hvid afrundet flade som sektioner på Medlemmer. */
export function AppCard({
  children,
  className,
  noPadding = false,
}: {
  children: ReactNode
  className?: string
  /** Ingen indvendig padding (fx tabel der fylder kortet). */
  noPadding?: boolean
}) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white shadow-sm',
        noPadding ? 'overflow-hidden' : 'p-6',
        className,
      )}
    >
      {children}
    </section>
  )
}

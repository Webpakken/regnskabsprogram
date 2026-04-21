import clsx from 'clsx'

/** Bilago-appikon (fra `/public/app-icon-64.png`, genereret fra `brand-icon-source.png`). */
export function BrandMark({
  className,
  size = 'md',
}: {
  className?: string
  /** `sm` ≈ 32px, `md` ≈ 36px (header/sidebar). */
  size?: 'sm' | 'md'
}) {
  return (
    <img
      src="/app-icon-64.png"
      alt=""
      width={64}
      height={64}
      className={clsx(
        'shrink-0 rounded-[22%] object-cover',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        className,
      )}
      aria-hidden
    />
  )
}

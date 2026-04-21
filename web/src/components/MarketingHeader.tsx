import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'

export function MarketingHeader() {
  const { pathname } = useLocation()
  const onSupport = pathname === '/support-tider'

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="text-lg font-semibold">Bilago</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <Link to="/#features" className="hover:text-slate-900">
            Funktioner
          </Link>
          <Link to="/#pricing" className="hover:text-slate-900">
            Priser
          </Link>
          <Link to="/#faq" className="hover:text-slate-900">
            FAQ
          </Link>
          <Link
            to="/support-tider"
            className={onSupport ? 'font-medium text-slate-900' : 'hover:text-slate-900'}
          >
            Support
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/login" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
            Log ind
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Kom i gang
          </Link>
        </div>
      </div>
    </header>
  )
}

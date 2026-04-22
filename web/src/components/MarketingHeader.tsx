import { Link, useLocation } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'

function navClass(active: boolean) {
  return active ? 'font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'
}

export function MarketingHeader() {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex min-w-0 items-center gap-0">
          <BrandLogo variant="header" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm md:flex">
          <Link to="/funktioner" className={navClass(pathname === '/funktioner')}>
            Funktioner
          </Link>
          <Link to="/priser" className={navClass(pathname === '/priser')}>
            Priser
          </Link>
          <Link to="/faq" className={navClass(pathname === '/faq')}>
            FAQ
          </Link>
          <Link
            to="/support-tider"
            className={navClass(pathname === '/support-tider')}
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

import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { copenhagenYear } from '@/lib/format'
import type { Database } from '@/types/database'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']

export function MarketingFooter({ pub }: { pub: PublicSettings | null }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div>
          <BrandLogo variant="footer" />
          <p className="mt-3 text-sm text-slate-600">CVR, moms, bilag og bank i ét sted — bygget i Danmark.</p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Produkt</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/funktioner" className="hover:text-slate-900">
                Funktioner
              </Link>
            </li>
            <li>
              <Link to="/priser" className="hover:text-slate-900">
                Priser
              </Link>
            </li>
            <li>
              <Link to="/faq" className="hover:text-slate-900">
                FAQ
              </Link>
            </li>
            <li>
              <Link to="/support-tider" className="hover:text-slate-900">
                Support og åbningstider
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Konto</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/login" className="hover:text-slate-900">
                Log ind
              </Link>
            </li>
            <li>
              <Link to="/signup" className="hover:text-slate-900">
                Opret konto
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Kontakt</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {pub?.contact_email ? (
              <li>
                <a href={`mailto:${pub.contact_email}`} className="hover:text-slate-900">
                  {pub.contact_email}
                </a>
              </li>
            ) : (
              <li>support@bilago.dk</li>
            )}
            {pub?.contact_phone ? <li>{pub.contact_phone}</li> : null}
            {pub?.support_hours ? (
              <li className="whitespace-pre-line text-xs text-slate-500">{pub.support_hours}</li>
            ) : null}
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Juridisk</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link to="/handelsbetingelser" className="hover:text-slate-900">
                Handelsbetingelser
              </Link>
            </li>
            <li>
              <Link to="/privatlivspolitik" className="hover:text-slate-900">
                Privatlivspolitik
              </Link>
            </li>
            <li>
              <Link to="/cookiepolitik" className="hover:text-slate-900">
                Cookiepolitik
              </Link>
            </li>
            <li>
              <Link to="/databehandleraftale" className="hover:text-slate-900">
                Databehandleraftale
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-500">
        © {copenhagenYear()} Bilago. Alle rettigheder forbeholdes.
      </div>
    </footer>
  )
}

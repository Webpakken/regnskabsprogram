import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { useApp } from '@/context/AppProvider'

export function SignupEmailConfirmationPage() {
  const { session, loading } = useApp()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Afventer e-mailbekræftelse
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Tjek din e-mail</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Vi har sendt et bekræftelseslink til din e-mail. Når du har bekræftet, kommer du til
          <span className="font-medium text-slate-900"> Kom i gang</span> (CVR og virksomhed).
        </p>
        {email ? (
          <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Vi afventer bekræftelse fra <span className="font-semibold">{email}</span>.
          </p>
        ) : (
          <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Vi afventer kundens e-mailbekræftelse.
          </p>
        )}
        <p className="mt-5 text-sm leading-6 text-slate-500">
          Linket kan nogle gange lande i spam eller uønsket mail. Hold denne side åben, eller åbn
          bekræftelseslinket direkte fra mailen.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/login"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Gå til login
          </Link>
          <Link
            to="/signup"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Brug anden e-mail
          </Link>
        </div>
      </div>
    </div>
  )
}

import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

/** Sentry er kun aktivt når en DSN er sat (dvs. ikke i lokal udvikling uden config). */
export const isSentryEnabled = Boolean(dsn)

/**
 * Initialiser Sentry — kaldes én gang før React monteres.
 * Kun fejl (ingen performance-tracing, ingen session replay) og med PII-minimering,
 * da Bilago håndterer regnskabs-/persondata (GDPR).
 */
export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    release: __SENTRY_RELEASE__,
    // Kun fejl — ingen tracing/replay.
    tracesSampleRate: 0,
    // Send ikke IP/cookies/headers automatisk.
    sendDefaultPii: false,
    beforeSend(event) {
      // Fjern potentielt følsomme felter, så bilag/beløb/tokens ikke havner hos Sentry.
      if (event.request) {
        event.request.cookies = undefined
        event.request.data = undefined
        event.request.query_string = undefined
        const h = event.request.headers
        if (h) {
          delete h.Authorization
          delete h.authorization
          delete h.Cookie
          delete h.cookie
          delete h.apikey
        }
      }
      return event
    },
  })
}

type SentryUserContext = {
  id: string
  companyId?: string | null
  role?: string | null
  platformRole?: string | null
}

/** Sæt bruger-/virksomhedskontekst på events — kun id'er og rolle, ingen e-mail/navn (PII). */
export function setSentryUser(ctx: SentryUserContext) {
  if (!dsn) return
  Sentry.setUser({ id: ctx.id })
  Sentry.setTags({
    company: ctx.companyId ?? 'none',
    role: ctx.role ?? 'none',
    platform_role: ctx.platformRole ?? 'none',
  })
}

/** Ryd kontekst ved log ud. */
export function clearSentryUser() {
  if (!dsn) return
  Sentry.setUser(null)
  Sentry.setTags({ company: 'none', role: 'none', platform_role: 'none' })
}

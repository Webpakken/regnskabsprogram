// Delt Sentry-hjælper til edge functions (Deno). Fanger server-side fejl vi ellers
// ikke ser. Kun fejl (ingen tracing), PII-minimeret. No-op hvis SENTRY_DSN mangler.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import * as Sentry from 'npm:@sentry/deno@10.65.0'

const dsn = Deno.env.get('SENTRY_DSN')?.trim()
export const isSentryEnabled = Boolean(dsn)

let initialized = false

/** Initialiser Sentry én gang (idempotent). No-op uden DSN. */
export function initSentry() {
  if (initialized || !dsn) return
  Sentry.init({
    dsn,
    environment: Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production',
    release: Deno.env.get('SENTRY_RELEASE'),
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
  initialized = true
}

/**
 * Rapportér en fejl med valgfri kontekst (funktionsnavn, company_id, invoice_id …).
 * Afventer flush, da edge-isolatet kan fryses lige efter svar. No-op uden DSN.
 */
export async function captureError(
  e: unknown,
  context?: Record<string, unknown>,
) {
  if (!dsn) return
  initSentry()
  Sentry.captureException(e, context ? { extra: context } : undefined)
  try {
    await Sentry.flush(2000)
  } catch {
    /* flush-fejl må ikke vælte handleren */
  }
}

type Handler = (req: Request) => Response | Promise<Response>

/**
 * Drop-in erstatning for `serve(handler)` med samme kald-form:
 * `serveWithSentry('funktionsnavn', async (req) => { ... })`.
 * Fanger uncaught/kastede fejl; funktioner med egne try/catch (der ikke re-kaster)
 * bør desuden kalde `captureError(...)` eksplicit på deres kritiske fejlpunkter.
 */
export function serveWithSentry(fnName: string, handler: Handler) {
  initSentry()
  return serve(async (req: Request) => {
    try {
      return await handler(req)
    } catch (e) {
      await captureError(e, { function: fnName })
      throw e
    }
  })
}

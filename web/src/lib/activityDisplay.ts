import type { Database } from '@/types/database'

type Activity = Database['public']['Tables']['activity_events']['Row']

function metaObject(meta: Activity['meta']): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  return meta as Record<string, unknown>
}

/** Kredit-relaterede hændelser (til f.eks. rød accent i lister). */
export function activityLooksLikeCreditNote(a: Activity): boolean {
  if (/^Kreditnota\s/i.test(a.title)) return true
  const m = metaObject(a.meta)
  if (!m) return false
  return Boolean(
    m.is_credit_note === true ||
      (typeof m.credited_invoice_id === 'string' && m.credited_invoice_id.length > 0),
  )
}

/** Vist titel — retter ældre rækker der kun har «Faktura» i titel men kredit-metadata. */
export function activityDisplayTitle(a: Activity): string {
  const m = metaObject(a.meta)
  const inferredCredit =
    m?.is_credit_note === true ||
    (typeof m.credited_invoice_id === 'string' && m.credited_invoice_id.length > 0)

  if (
    inferredCredit &&
    (a.event_type === 'invoice_created' || a.event_type === 'invoice_sent') &&
    /^Faktura\s/i.test(a.title)
  ) {
    return a.title.replace(/^Faktura\s/i, 'Kreditnota ')
  }
  return a.title
}

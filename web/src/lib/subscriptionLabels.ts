/** Stripe-abonnementsstatus vist på dansk i UI (rå API-værdier gemmes i DB). */
export function subscriptionStatusLabelDa(status: string | null | undefined): string {
  if (status == null || status === '') return 'Ingen'
  switch (status) {
    case 'active':
      return 'Aktiv'
    case 'trialing':
      return 'Prøveperiode'
    case 'past_due':
      return 'Forfalden betaling'
    case 'canceled':
    case 'cancelled':
      return 'Opsagt'
    case 'unpaid':
      return 'Ubetalt'
    case 'incomplete':
      return 'Ikke fuldført'
    case 'incomplete_expired':
      return 'Udløbet'
    default:
      return status
  }
}

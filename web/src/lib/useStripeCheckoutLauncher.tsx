import { useCallback, useState } from 'react'
import {
  redirectToStripeCheckout,
  type StripeCheckoutReturnPath,
} from '@/lib/edge'

export function useStripeCheckoutLauncher() {
  const [loading, setLoading] = useState(false)
  const launch = useCallback(
    async (
      companyId: string,
      options?: { returnPath?: StripeCheckoutReturnPath; billingPlanId?: string },
    ) => {
      if (loading) return
      setLoading(true)
      try {
        await redirectToStripeCheckout(companyId, options)
      } catch {
        setLoading(false)
      }
    },
    [loading],
  )
  return { launch, loading }
}

export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-30"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

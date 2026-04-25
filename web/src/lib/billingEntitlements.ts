export type BillingFeatureKey =
  | 'invoices'
  | 'vouchers'
  | 'voucher_projects'
  | 'expense_links'
  | 'bank'
  | 'vat'
  | 'members'
  | 'invoice_automation'
  | 'ocr_scans'
  | 'support'
  | (string & {})

export type BillingEntitlement = {
  plan_id: string
  plan_slug: string
  plan_name: string
  feature_key: BillingFeatureKey
  feature_name: string
  enabled: boolean
  limit_value: number | null
}

export function entitlementMap(entitlements: BillingEntitlement[]) {
  return new Map(entitlements.map((row) => [row.feature_key, row]))
}

export function canUseFeature(
  entitlements: BillingEntitlement[],
  featureKey: BillingFeatureKey,
): boolean {
  return entitlementMap(entitlements).get(featureKey)?.enabled === true
}

export function getFeatureLimit(
  entitlements: BillingEntitlement[],
  featureKey: BillingFeatureKey,
): number | null {
  return entitlementMap(entitlements).get(featureKey)?.limit_value ?? null
}

export function currentPlanName(entitlements: BillingEntitlement[]): string | null {
  return entitlements[0]?.plan_name ?? null
}

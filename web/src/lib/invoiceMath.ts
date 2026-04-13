export type DraftLine = {
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
}

export function lineAmounts(line: DraftLine) {
  const net = Math.round(line.quantity * line.unit_price_cents)
  const vat = Math.round((net * line.vat_rate) / 100)
  const gross = net + vat
  return { line_net_cents: net, line_vat_cents: vat, line_gross_cents: gross }
}

export function totalsFromLines(lines: DraftLine[]) {
  return lines.reduce(
    (acc, l) => {
      const { line_net_cents, line_vat_cents, line_gross_cents } =
        lineAmounts(l)
      return {
        net_cents: acc.net_cents + line_net_cents,
        vat_cents: acc.vat_cents + line_vat_cents,
        gross_cents: acc.gross_cents + line_gross_cents,
      }
    },
    { net_cents: 0, vat_cents: 0, gross_cents: 0 },
  )
}

/** Whole rupees, "Rs 1,250". */
export function formatRs(amount: number): string {
  const n = Math.round(amount)
  const sign = n < 0 ? '-' : ''
  return `${sign}Rs ${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/**
 * Format a number as Norwegian kroner
 * e.g. 12345.67 → "12 345 kr"
 */
export function formatNOK(amount, decimals = 0) {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/**
 * Format a date string to Norwegian short format
 * e.g. "2026-04-03" → "3. apr. 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

/**
 * Get current month as "yyyy-MM" string
 */
export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Format "2026-04" → "April 2026"
 */
export function formatMonth(monthStr) {
  if (!monthStr) return ''
  const [year, month] = monthStr.split('-')
  return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' })
    .format(new Date(Number(year), Number(month) - 1, 1))
}

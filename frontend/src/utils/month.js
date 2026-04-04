import { currentMonth } from './format'

export const ACTIVE_MONTH_STORAGE_KEY = 'sparebuddy-active-month'

export function getActiveMonth() {
  if (typeof window === 'undefined') return currentMonth()
  return window.localStorage.getItem(ACTIVE_MONTH_STORAGE_KEY) || currentMonth()
}

export function setActiveMonth(month) {
  if (typeof window === 'undefined' || !month) return
  window.localStorage.setItem(ACTIVE_MONTH_STORAGE_KEY, month)
}

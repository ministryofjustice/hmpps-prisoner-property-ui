export interface DisposalBanner {
  overdue: boolean
  date: string // ISO yyyy-mm-dd
}

/**
 * The disposal banner state for a container's proposed disposal date (ISO yyyy-mm-dd), relative to
 * today: `overdue` when the date has already passed, otherwise it is due today or in the future. Null
 * when there is no disposal date (no banner).
 */
export const disposalBanner = (proposedDisposalDate: string | null | undefined): DisposalBanner | null => {
  if (!proposedDisposalDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${proposedDisposalDate}T00:00:00`)
  return { overdue: due.getTime() < today.getTime(), date: proposedDisposalDate }
}

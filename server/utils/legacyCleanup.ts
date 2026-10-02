import type { PropertyEventType } from '../data/prisonerPropertyApiTypes'

/**
 * Whether a history event is a legacy NOMIS property record the clean-up archived under the 13-month retention
 * rule: a REMOVED event the API flags as written by a legacy clean-up job, as opposed to a container that was
 * marked inactive in NOMIS (also REMOVED, but not flagged).
 */
export const isLegacyArchive = (event: { eventType?: PropertyEventType | null; legacyCleanup?: boolean }): boolean =>
  event.eventType === 'REMOVED' && event.legacyCleanup === true

const LEGACY_ARCHIVE = 'Legacy property record archived following DPS migration'

/** The history title for an archived legacy record, naming the seal where a real one was recorded. */
export const legacyArchiveTitle = (seal: string | null): string =>
  seal ? `Seal ${seal} - ${LEGACY_ARCHIVE}` : LEGACY_ARCHIVE

export const LEGACY_ARCHIVE_DETAILS =
  'This record was automatically archived because it exceeded the applicable retention period before migration to DPS and no further property action was required.'

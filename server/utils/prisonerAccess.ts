import type { PrisonerPropertyContainer, PrisonerTimelineItem } from '../data/prisonerPropertyApiTypes'

/**
 * How much of a prisoner's property record a user may see:
 *  - FULL: the whole record, as for someone who holds the prisoner's caseload.
 *  - THIS_PRISON_ONLY: only the property held (or once held) at the user's own prison, and its history. The
 *    service is about the property rather than the person, so staff must be able to deal with property left
 *    at their prison after its owner has gone, without seeing anything else about where that person now is.
 */
export type PrisonerAccessLevel = 'FULL' | 'THIS_PRISON_ONLY'

// The DPS "released prisoner viewing" role. Note setUpCurrentUser strips the ROLE_ prefix.
export const RELEASED_PRISONER_VIEWING_ROLE = 'INACTIVE_BOOKINGS'

// The prisoner-search prison ids that stand for "not in any prison": released, and between prisons.
const RELEASED_OR_TRANSFERRING = ['OUT', 'TRN']

export interface PrisonerAccessInput {
  // The prisoner's current prison (prisoner-search prisonId, or OUT / TRN), or null when it is not known.
  prisonerPrisonId: string | null
  caseloadIds: string[]
  activeCaseloadId: string
  userRoles: string[]
  // Every one of the prisoner's containers, at every prison, including those no longer held.
  containers: PrisonerPropertyContainer[]
}

/**
 * Whether the user may see this prisoner's property, and how much of it. The rules, in order:
 *  1. The prisoner's current prison is one of the user's caseloads (any, not just the active one - the same
 *     rule the prison permissions library applies, so the DPS profile card and these pages agree): FULL.
 *  2. The prisoner is released or mid-transfer and the user has the released prisoner viewing role: FULL.
 *  3. Any of the prisoner's property, current or no longer held, is at the user's active caseload - exactly
 *     what the establishment list can show, so every link from it works: THIS_PRISON_ONLY.
 * Null otherwise. An unknown current prison never satisfies 1 or 2, so only property at this prison counts.
 */
export const decidePrisonerAccess = ({
  prisonerPrisonId,
  caseloadIds,
  activeCaseloadId,
  userRoles,
  containers,
}: PrisonerAccessInput): PrisonerAccessLevel | null => {
  if (prisonerPrisonId && caseloadIds.includes(prisonerPrisonId)) return 'FULL'
  if (
    prisonerPrisonId &&
    RELEASED_OR_TRANSFERRING.includes(prisonerPrisonId) &&
    userRoles.includes(RELEASED_PRISONER_VIEWING_ROLE)
  ) {
    return 'FULL'
  }
  if (containers.some(container => container.prisonId === activeCaseloadId)) return 'THIS_PRISON_ONLY'
  return null
}

/**
 * Whether property may be added at the user's prison for this prisoner: they are held there now, or already
 * have property there. Stops property being created for someone with no link to the prison.
 */
export const canAddPropertyHere = (
  prisonerPrisonId: string | null,
  activeCaseloadId: string,
  containers: PrisonerPropertyContainer[],
): boolean =>
  prisonerPrisonId === activeCaseloadId || containers.some(container => container.prisonId === activeCaseloadId)

/** The containers the user may see: all of them for FULL, only those at their prison otherwise. */
export const scopeContainers = (
  containers: PrisonerPropertyContainer[],
  level: PrisonerAccessLevel,
  activeCaseloadId: string,
): PrisonerPropertyContainer[] =>
  level === 'FULL' ? containers : containers.filter(container => container.prisonId === activeCaseloadId)

/**
 * The timeline entries the user may see. For THIS_PRISON_ONLY that is only the events of the containers they
 * can see: the prisoner's movements, release date and other prisons' DPS start dates say where the person has
 * been, which is not theirs to see.
 */
export const scopeTimeline = (
  items: PrisonerTimelineItem[],
  level: PrisonerAccessLevel,
  visibleContainers: PrisonerPropertyContainer[],
): PrisonerTimelineItem[] => {
  if (level === 'FULL') return items
  const visibleIds = new Set(visibleContainers.map(container => container.id))
  return items.filter(item => item.containerId != null && visibleIds.has(item.containerId))
}

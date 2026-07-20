import type { PrisonerPropertyContainer, RemovalOutcome } from '../data/prisonerPropertyApiTypes'
import { containerStatusTag } from './statusTags'

const REMOVAL_OUTCOME_LABELS: Record<RemovalOutcome, string> = {
  DISPOSED: 'Disposed',
  RETURNED: 'Returned',
  TRANSFERRED: 'Transferred',
  COMBINED: 'Combined',
  CREATED_IN_ERROR: 'Created in error',
  REMOVED: 'Removed',
}

export const removalOutcomeLabel = (outcome: RemovalOutcome): string => REMOVAL_OUTCOME_LABELS[outcome] ?? outcome

// Removal outcomes surfaced on the "Property returned or transferred" tab. COMBINED (merged into another
// container, still tracked there) and CREATED_IN_ERROR (a mistake) are deliberately excluded — they are
// not property the person had returned or transferred out.
const RETURNED_OR_TRANSFERRED_OUTCOMES: RemovalOutcome[] = ['REMOVED', 'RETURNED', 'DISPOSED', 'TRANSFERRED']

export interface ReturnedContainerRow {
  container: PrisonerPropertyContainer
  status: PropertyStatusTag
}

/**
 * The prisoner's "old" property no longer actively managed here — containers that were removed, returned,
 * disposed of or transferred out — newest first (by the date they left storage). Status is derived from
 * the container's current status (REMOVED/RETURNED/DISPOSED/TRANSFER) via the shared person-view palette.
 */
export const buildReturnedOrTransferredView = (containers: PrisonerPropertyContainer[]): ReturnedContainerRow[] =>
  containers
    .filter(
      container => container.removalOutcome && RETURNED_OR_TRANSFERRED_OUTCOMES.includes(container.removalOutcome),
    )
    .sort((a, b) => (b.removalDate ?? b.createDateTime).localeCompare(a.removalDate ?? a.createDateTime))
    .map(container => ({ container, status: containerStatusTag(container.currentStatus) }))

/**
 * Split a prisoner's containers into current (still held) and past (removed) property. A container is
 * "past" once it has a removal outcome (disposed / returned / transferred / combined).
 */
export const partitionContainers = (
  containers: PrisonerPropertyContainer[],
): { active: PrisonerPropertyContainer[]; past: PrisonerPropertyContainer[] } => {
  const active: PrisonerPropertyContainer[] = []
  const past: PrisonerPropertyContainer[] = []
  containers.forEach(container => (container.removalOutcome ? past : active).push(container))
  return { active, past }
}

/**
 * The prisoner's current establishment name. Prefers the authoritative `prisonerCurrentPrisonName`
 * from the API (available even when the prisoner has no property at their current prison); falls back
 * to the holding prison of a container flagged `inPrisonersCurrentPrison` for older API responses that
 * don't carry the field yet. Null when neither is available.
 */
export const resolveCurrentPrisonName = (containers: PrisonerPropertyContainer[]): string | null =>
  containers.find(container => container.prisonerCurrentPrisonName)?.prisonerCurrentPrisonName ??
  containers.find(container => container.inPrisonersCurrentPrison)?.prisonName ??
  null

export interface PropertyStatusTag {
  text: string
  classes: string
}

export interface PersonPropertyRow {
  container: PrisonerPropertyContainer
  status: PropertyStatusTag
}

export interface PersonPropertyView {
  inEstablishment: PersonPropertyRow[]
  dueToTransferIn: PersonPropertyRow[]
  hasLeft: boolean
  prisonerCurrentPrisonName: string | null
}

/**
 * Build the person property view relative to the establishment being viewed (the user's active
 * caseload). The API's status is viewer-independent, so the display status for "transfer in/out" is
 * derived here from where the container is held, where the prisoner now is, and which establishment is
 * being viewed:
 *  - Property held in the viewed establishment ("Property in this establishment"): "Due for disposal"
 *    when a disposal is due, otherwise "Stored" if the prisoner is still here, or "Due for transfer
 *    out" if they have moved on (the property needs to follow them).
 *  - Property held elsewhere, shown only while the prisoner is in the viewed establishment ("Property
 *    due to be transferred in"): "Due for disposal" or "Due for transfer in".
 * Removed containers (disposed/returned/transferred/combined) are excluded.
 */
export const buildPersonPropertyView = (
  containers: PrisonerPropertyContainer[],
  viewedPrisonId: string,
): PersonPropertyView => {
  const prisonerCurrentPrisonId = containers.find(c => c.prisonerCurrentPrisonId)?.prisonerCurrentPrisonId ?? null
  // When the current prison is unknown (older API responses) assume the prisoner is here, so we never
  // wrongly claim they have left.
  const prisonerHere = prisonerCurrentPrisonId == null ? true : prisonerCurrentPrisonId === viewedPrisonId
  const hasLeft = prisonerCurrentPrisonId != null && !prisonerHere

  const held = containers.filter(container => !container.removalOutcome)

  const inEstablishment: PersonPropertyRow[] = held
    .filter(container => container.prisonId === viewedPrisonId)
    .map(container => ({ container, status: inEstablishmentStatus(container, prisonerHere) }))

  const dueToTransferIn: PersonPropertyRow[] = prisonerHere
    ? held
        .filter(container => container.prisonId !== viewedPrisonId)
        .map(container => ({ container, status: transferInStatus(container) }))
    : []

  return { inEstablishment, dueToTransferIn, hasLeft, prisonerCurrentPrisonName: resolveCurrentPrisonName(containers) }
}

const inEstablishmentStatus = (container: PrisonerPropertyContainer, prisonerHere: boolean): PropertyStatusTag => {
  if (container.currentStatus === 'DISPOSAL_REQUIRED') return { text: 'Due for disposal', classes: 'govuk-tag--orange' }
  if (container.currentStatus === 'DUE_FOR_RETURN') return { text: 'Due for return', classes: 'govuk-tag--yellow' }
  if (prisonerHere) return { text: 'Stored', classes: 'govuk-tag--green' }
  return { text: 'Due for transfer out', classes: 'govuk-tag--grey' }
}

const transferInStatus = (container: PrisonerPropertyContainer): PropertyStatusTag => {
  if (container.currentStatus === 'DISPOSAL_REQUIRED') return { text: 'Due for disposal', classes: 'govuk-tag--orange' }
  if (container.currentStatus === 'DUE_FOR_RETURN') return { text: 'Due for return', classes: 'govuk-tag--yellow' }
  return { text: 'Due for transfer in', classes: 'govuk-tag--turquoise' }
}

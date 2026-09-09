import type {
  PrisonerMovementStatus,
  PrisonerPropertyContainer,
  RemovalOutcome,
} from '../data/prisonerPropertyApiTypes'
import { containerStatusTag } from './statusTags'
import {
  canManageContainerHere,
  DUE_FOR_TRANSFER_IN_TAG,
  IN_TRANSIT_TAG,
  isInTransitTo,
  sealNumberLabel,
} from './propertyList'

const REMOVAL_OUTCOME_LABELS: Record<RemovalOutcome, string> = {
  DISPOSED: 'Disposed',
  RETURNED: 'Returned',
  TRANSFERRED: 'Transferred',
  COMBINED: 'Combined',
  CREATED_IN_ERROR: 'Created in error',
  REMOVED: 'Removed',
}

export const removalOutcomeLabel = (outcome: RemovalOutcome): string => REMOVAL_OUTCOME_LABELS[outcome] ?? outcome

// Removal outcomes surfaced on the "Returned or transferred property" tab. COMBINED (merged into another
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
  elsewhereInTransit: PersonPropertyRow[]
  hasLeft: boolean
  prisonerCurrentPrisonName: string | null
}

/**
 * Build the person property view relative to the establishment being viewed (the user's active caseload).
 *
 * A container's *status* comes from the API, which owns the rule - including the parts that depend on
 * where the owner now is. This used to be re-derived here, and the two implementations disagreed: for a
 * released person `prisonerCurrentPrisonId` is the sentinel "OUT", which is never the viewed prison, so
 * their property was tagged "Due for transfer out" here while the establishment list called it "Stored".
 *
 * What is decided here is only what is genuinely relative to the viewer - which section a container
 * belongs in, and the incoming-property tags, which describe a container's relationship to *this* prison
 * rather than its own state:
 *  - Property held in the viewed establishment ("Property in this establishment") shows its own status.
 *  - Property held elsewhere, shown only while the prisoner is in the viewed establishment ("Property due
 *    to be transferred in"): "Due for transfer in", plus property the sending prison has already
 *    transferred out to here but that has not been logged here yet ("In transit").
 * Removed containers are otherwise excluded (disposed/returned/combined, and transfers already
 * reconciled - once this prison logs the arrival, its own record takes over).
 */
export const buildPersonPropertyView = (
  containers: PrisonerPropertyContainer[],
  viewedPrisonId: string,
  prisonerMovementStatus?: PrisonerMovementStatus | null,
): PersonPropertyView => {
  const prisonerCurrentPrisonId = containers.find(c => c.prisonerCurrentPrisonId)?.prisonerCurrentPrisonId ?? null
  // When the current prison is unknown (older API responses) assume the prisoner is here, so we never
  // wrongly claim they have left. The "TRN"/"OUT" sentinels need no special handling: neither equals a real
  // prison id, so someone in transit or released correctly counts as not here and as having left.
  const prisonerHere = prisonerCurrentPrisonId == null ? true : prisonerCurrentPrisonId === viewedPrisonId
  const hasLeft = prisonerCurrentPrisonId != null && !prisonerHere

  const inEstablishment: PersonPropertyRow[] = containers
    .filter(container => canManageContainerHere(container, viewedPrisonId))
    .map(container => ({ container, status: containerStatusTag(container.currentStatus) }))

  // Incoming property, only meaningful while the prisoner is here. Non-editable until this prison logs the
  // arrival, at which point its own record takes over.
  const dueToTransferIn: PersonPropertyRow[] = prisonerHere
    ? containers
        .filter(container => isIncomingTo(container, viewedPrisonId))
        .map(container => ({ container, status: transferInStatus(container, viewedPrisonId) }))
    : []

  // While the person is between establishments nobody can claim their property: the transfer-out movement
  // does not say where they are going, so no prison knows it is coming to them. It is still worth seeing that
  // it exists and where it is, so it is listed plainly - held at another establishment, no actions, and
  // deliberately not called "due to be transferred in", which would assert a destination we do not have.
  const elsewhereInTransit: PersonPropertyRow[] =
    prisonerMovementStatus === 'IN_TRANSIT'
      ? containers
          .filter(container => !container.removalOutcome && container.prisonId !== viewedPrisonId)
          .map(container => ({ container, status: containerStatusTag(container.currentStatus) }))
      : []

  return {
    inEstablishment,
    dueToTransferIn,
    elsewhereInTransit,
    hasLeft,
    prisonerCurrentPrisonName: resolveCurrentPrisonName(containers),
  }
}

/**
 * Whether a container is property coming *in* to [viewedPrisonId]: either still held at the prison the person
 * has moved on from, or already sent by it and awaiting logging here.
 *
 * The single definition of what belongs in the "Property due to be transferred in" section - and of what a
 * previous seal number can be matched against when logging an arrival (see `matchableContainers`). Sharing it
 * is what guarantees that anything staff can see in that list can actually be quoted: an in-transit container
 * carries `removalOutcome: 'TRANSFERRED'`, so a rule written as "not removed" silently excludes exactly the
 * property most obviously on its way here.
 */
export const isIncomingTo = (container: PrisonerPropertyContainer, viewedPrisonId: string): boolean =>
  (!container.removalOutcome && container.prisonId !== viewedPrisonId) || isInTransitTo(container, viewedPrisonId)

/**
 * The seal number for a container in a list, as seen from [viewedPrisonId].
 *
 * Property coming *in* here keeps its stored seal even when that is the NOMIS placeholder, because this is the
 * value staff read off the screen and type into "previous seal number" when they log its arrival - and that
 * field is matched against the stored string, by exactly this set of containers (see `matchableContainers`).
 * Replacing it with "Not entered" would leave nothing to quote and no way to reconcile the transfer. Everything
 * else reads "Not entered" as usual. MAPB-862 removes the placeholder properly, at which point this exception
 * goes with it.
 */
export const sealNumberCell = (container: PrisonerPropertyContainer, viewedPrisonId: string): string => {
  const stored = container.currentSealNumber?.trim()
  // A container with no seal at all has nothing to quote either, so it reads "Not entered" wherever it is.
  if (stored && isIncomingTo(container, viewedPrisonId)) return stored
  return sealNumberLabel(stored)
}

const transferInStatus = (container: PrisonerPropertyContainer, viewedPrisonId: string): PropertyStatusTag => {
  // An in-transit container has already left the sending prison, so its own status is a historical
  // "Transferred out" - the fact that matters here is that it is on its way and still needs storing.
  if (isInTransitTo(container, viewedPrisonId)) return IN_TRANSIT_TAG
  // Disposal and return are instructions about the property itself, so they outrank "it is coming here".
  if (container.currentStatus === 'DISPOSAL_REQUIRED' || container.currentStatus === 'DUE_FOR_RETURN') {
    return containerStatusTag(container.currentStatus)
  }
  return DUE_FOR_TRANSFER_IN_TAG
}

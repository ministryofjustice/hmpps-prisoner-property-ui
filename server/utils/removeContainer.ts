import type { ContainerStatus, PrisonerPropertyContainer, RemovalOutcome } from '../data/prisonerPropertyApiTypes'
import type { PropertyStatusTag } from './personProperty'
import { containerStatusTag } from './statusTags'

// The reasons staff can give for removing a container, in the order shown on the remove screen.
export interface RemoveReason {
  value: RemovalOutcome
  text: string
}

export const REMOVE_REASONS: RemoveReason[] = [
  { value: 'RETURNED', text: 'The property was returned' },
  { value: 'DISPOSED', text: 'The property was disposed of' },
  { value: 'TRANSFERRED', text: 'The property was transferred to another establishment' },
  { value: 'CREATED_IN_ERROR', text: 'The record was created in error' },
]

const REMOVE_REASON_VALUES = new Set<RemovalOutcome>(REMOVE_REASONS.map(reason => reason.value))

export const isRemoveReason = (value: unknown): value is RemovalOutcome =>
  typeof value === 'string' && REMOVE_REASON_VALUES.has(value as RemovalOutcome)

// The status the container will show once removed with the given reason (its tag is shown on Check your
// answers, from the shared palette so it matches the lists). COMBINED and REMOVED are not staff-selectable
// removal reasons (combine has its own journey; REMOVED is only ever set by the NOMIS sync or the legacy
// clean-up), but the map is keyed by every RemovalOutcome for completeness.
const RESULT_STATUS: Record<RemovalOutcome, ContainerStatus> = {
  RETURNED: 'RETURNED',
  DISPOSED: 'DISPOSED',
  TRANSFERRED: 'TRANSFER',
  CREATED_IN_ERROR: 'CREATED_IN_ERROR',
  COMBINED: 'COMBINED',
  REMOVED: 'REMOVED',
}

export const removeResultStatus = (outcome: RemovalOutcome): PropertyStatusTag =>
  containerStatusTag(RESULT_STATUS[outcome])

// The label for the removal-date row on Check your answers, per reason.
export const removalDateLabel = (outcome: RemovalOutcome): string => {
  switch (outcome) {
    case 'DISPOSED':
      return 'Date property disposed of'
    case 'RETURNED':
      return 'Date property returned'
    case 'TRANSFERRED':
      return 'Date property transferred'
    default:
      return 'Date removed'
  }
}

// Where a transfer sends the container: the prisoner's current establishment (from prisoner-search).
// `needsInterruption` is true when prisoner-search does NOT confirm the prisoner has been received into
// a settled, different establishment yet - the destination isn't reliable, so we warn before removing.
export interface TransferTarget {
  toPrisonId: string | null
  toPrisonName: string | null
  needsInterruption: boolean
}

export const resolveTransferTarget = (container: PrisonerPropertyContainer, viewedPrisonId: string): TransferTarget => {
  const toPrisonId = container.prisonerCurrentPrisonId ?? null
  const toPrisonName = container.prisonerCurrentPrisonName ?? null
  const receivedElsewhere =
    container.prisonerMovementStatus === 'IN_ESTABLISHMENT' && toPrisonId != null && toPrisonId !== viewedPrisonId
  return { toPrisonId, toPrisonName, needsInterruption: !receivedElsewhere }
}

import type { PrisonerPropertyContainer, RemovalOutcome } from '../data/prisonerPropertyApiTypes'

const REMOVAL_OUTCOME_LABELS: Record<RemovalOutcome, string> = {
  DISPOSED: 'Disposed',
  RETURNED: 'Returned',
  TRANSFERRED: 'Transferred',
  COMBINED: 'Combined',
}

export const removalOutcomeLabel = (outcome: RemovalOutcome): string => REMOVAL_OUTCOME_LABELS[outcome] ?? outcome

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
 * The prisoner's current establishment name, taken from a container held at the prisoner's current
 * prison. Returns null when none of the containers are held where the prisoner currently is.
 */
export const resolveCurrentPrisonName = (containers: PrisonerPropertyContainer[]): string | null =>
  containers.find(container => container.inPrisonersCurrentPrison)?.prisonName ?? null

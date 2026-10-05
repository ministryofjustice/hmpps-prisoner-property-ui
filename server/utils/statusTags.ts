import type { ContainerStatus } from '../data/prisonerPropertyApiTypes'

export interface StatusTag {
  text: string
  classes: string
}

// The one status palette, used everywhere a container status is shown: the person property tab, the
// establishment-wide list, the property-history timeline, the "returned or transferred" list and the remove
// journey's result. There were two of these, and they had already drifted apart on TRANSFER ("Transferred out"
// vs "Transferred").
//
// The colours of the statuses property leaves storage with were set by design for the "Property no longer held"
// filter (MAPB-934): returned magenta, disposed orange, transferred out blue (the default tag colour), created in
// error light grey (an operational error) and removed dark grey (legacy data - marked inactive in NOMIS, or
// archived by the legacy clean-up).
const STATUS_TAGS: Record<ContainerStatus, StatusTag> = {
  STORED: { text: 'Stored', classes: 'govuk-tag--green' },
  DUE_FOR_TRANSFER_OUT: { text: 'Due for transfer out', classes: 'govuk-tag--grey' },
  DUE_FOR_RETURN: { text: 'Due for return', classes: 'govuk-tag--yellow' },
  DISPOSAL_REQUIRED: { text: 'Due for disposal', classes: 'govuk-tag--orange' },
  DISPOSED: { text: 'Disposed', classes: 'govuk-tag--orange' },
  RETURNED: { text: 'Returned', classes: 'govuk-tag--magenta' },
  TRANSFER: { text: 'Transferred out', classes: 'govuk-tag--blue' },
  COMBINED: { text: 'Combined', classes: 'govuk-tag--grey' },
  CREATED_IN_ERROR: { text: 'Created in error', classes: 'govuk-tag--grey' },
  REMOVED: { text: 'Removed', classes: 'moj-tag--grey' },
}

/**
 * The statuses a container leaves storage with that the establishment list can filter on, in the order the
 * "Property no longer held" filter lists them - the reasons staff can give on the remove journey, plus Removed
 * for legacy data. Combined is left out: the contents live on in the container they were combined into.
 */
export const NO_LONGER_HELD_STATUSES: ContainerStatus[] = [
  'RETURNED',
  'DISPOSED',
  'TRANSFER',
  'CREATED_IN_ERROR',
  'REMOVED',
]

export const ALL_CONTAINER_STATUSES = Object.keys(STATUS_TAGS) as ContainerStatus[]

/**
 * The tag for a container's status as the API reports it. The API owns what a container's status *is* -
 * including the parts that depend on where its owner now is - so this only maps it to display text and a
 * colour. Nothing here should re-derive a status: that is how the person view and the establishment list
 * came to disagree.
 */
export const containerStatusTag = (status: ContainerStatus): StatusTag =>
  STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

import type { ContainerStatus } from '../data/prisonerPropertyApiTypes'

export interface StatusTag {
  text: string
  classes: string
}

// The one status palette, used everywhere a container status is shown: the person property tab, the
// establishment-wide list, the property-history timeline and the "returned or transferred" list. There
// were two of these, and they had already drifted apart on TRANSFER ("Transferred out" vs "Transferred").
const STATUS_TAGS: Record<ContainerStatus, StatusTag> = {
  STORED: { text: 'Stored', classes: 'govuk-tag--green' },
  DUE_FOR_TRANSFER_OUT: { text: 'Due for transfer out', classes: 'govuk-tag--grey' },
  DUE_FOR_RETURN: { text: 'Due for return', classes: 'govuk-tag--yellow' },
  DISPOSAL_REQUIRED: { text: 'Due for disposal', classes: 'govuk-tag--orange' },
  DISPOSED: { text: 'Disposed', classes: 'govuk-tag--red' },
  RETURNED: { text: 'Returned', classes: 'govuk-tag--green' },
  TRANSFER: { text: 'Transferred out', classes: 'govuk-tag--grey' },
  COMBINED: { text: 'Combined', classes: 'govuk-tag--grey' },
  CREATED_IN_ERROR: { text: 'Created in error', classes: 'govuk-tag--grey' },
  REMOVED: { text: 'Removed', classes: 'govuk-tag--grey' },
}

export const ALL_CONTAINER_STATUSES = Object.keys(STATUS_TAGS) as ContainerStatus[]

/**
 * The tag for a container's status as the API reports it. The API owns what a container's status *is* -
 * including the parts that depend on where its owner now is - so this only maps it to display text and a
 * colour. Nothing here should re-derive a status: that is how the person view and the establishment list
 * came to disagree.
 */
export const containerStatusTag = (status: ContainerStatus): StatusTag =>
  STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

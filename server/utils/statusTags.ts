import type { ContainerStatus } from '../data/prisonerPropertyApiTypes'

export interface StatusTag {
  text: string
  classes: string
}

// Person-view status tags, shared by the property-history timeline and the "returned or transferred"
// list. Uses the person-view palette (Stored is green here, matching the property tab these sit
// alongside) rather than the establishment-list palette.
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

export const containerStatusTag = (status: ContainerStatus): StatusTag =>
  STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

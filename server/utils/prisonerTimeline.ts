import type { ContainerStatus, PrisonerTimelineItem } from '../data/prisonerPropertyApiTypes'
import { containerTypeLabel } from './propertyList'
import { formatDate } from './utils'

export interface TimelineTag {
  text: string
  classes: string
}

export interface TimelineDetails {
  containerType: string
  sealNumber: string | null
  status: TimelineTag | null
  locationLabel: string
  location: string | null
  historyUrl: string
}

// A single, render-ready timeline item: a status tag, a title sentence, a byline, the raw event
// datetime (formatted in the template) and, for container events, the expandable container details.
export interface TimelineRow {
  title: string
  tag: TimelineTag | null
  byline: string
  dateTime: string
  details: TimelineDetails | null
}

// Status tags for the timeline. Uses the person-view palette (Stored is green here, matching the
// property tab this timeline sits alongside) rather than the establishment-list palette.
const TIMELINE_STATUS_TAGS: Record<ContainerStatus, TimelineTag> = {
  STORED: { text: 'Stored', classes: 'govuk-tag--green' },
  DUE_FOR_TRANSFER_OUT: { text: 'Due for transfer out', classes: 'govuk-tag--grey' },
  DUE_FOR_RETURN: { text: 'Due for return', classes: 'govuk-tag--yellow' },
  DISPOSAL_REQUIRED: { text: 'Due for disposal', classes: 'govuk-tag--orange' },
  DISPOSED: { text: 'Disposed', classes: 'govuk-tag--red' },
  RETURNED: { text: 'Returned', classes: 'govuk-tag--green' },
  TRANSFER: { text: 'Transferred out', classes: 'govuk-tag--grey' },
  COMBINED: { text: 'Combined', classes: 'govuk-tag--grey' },
  CREATED_IN_ERROR: { text: 'Created in error', classes: 'govuk-tag--grey' },
}

const timelineTag = (status: ContainerStatus): TimelineTag =>
  TIMELINE_STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

const containerPrefix = (seal: string | null): string => (seal ? `Property container ${seal}` : 'Property container')

/** The title sentence for a timeline item, using the resolved prison names and seal-as-of-event. */
const timelineTitle = (item: PrisonerTimelineItem): string => {
  if (item.itemType === 'PRISONER_MOVEMENT') {
    const prison = item.toPrisonName ?? 'another establishment'
    return item.movementKind === 'TRANSFER_IN' ? `Transferred in to ${prison}` : `Admitted to ${prison}`
  }

  if (item.itemType === 'SCHEDULED_FOR_RELEASE') {
    return `Scheduled for release on ${formatDate(item.eventDate)}`
  }

  const container = containerPrefix(item.sealNumber)
  const establishment = item.actingEstablishmentName ?? 'this establishment'
  const toPrison = item.toPrisonName ?? 'another establishment'

  switch (item.eventType) {
    case 'CREATED_SEALED':
      return `${container} added to storage at ${establishment}`
    case 'SEAL_CHANGED':
      // The container is identified by its (new) seal, so avoid repeating it as a prefix.
      return item.sealNumber
        ? `Property container details changed — seal number now ${item.sealNumber}`
        : 'Property container details changed — seal number'
    case 'CONTAINER_TYPE_CHANGE':
      return `${container} details changed — property type`
    case 'MOVED':
      return item.toStorageLocationType === 'BRANSTON'
        ? `${container} moved to Branston (offsite)`
        : `${container} storage location changed`
    case 'PRISONER_RECEIVED':
      return `${container} due for transfer out to ${toPrison}`
    case 'PRISONER_RELEASED':
      return `${container} due for return`
    case 'TRANSFERRED':
      return `${container} transferred out to ${toPrison}`
    case 'RETURNED':
      return `${container} returned to the person`
    case 'DISPOSAL_REQUIRED':
      return `${container} due for disposal`
    case 'DISPOSED':
      return `${container} disposed of`
    case 'COMBINED':
      return `${container} combined into another container`
    case 'CREATED_IN_ERROR':
      return `${container} removed — created in error`
    default:
      return `${container} updated`
  }
}

/**
 * "by {name}, {establishment}" for user actions, "System generated, {establishment}" for system ones.
 * The acting user's name is resolved from `nameByUsername`, falling back to the raw username when it
 * could not be looked up.
 */
const timelineByline = (item: PrisonerTimelineItem, nameByUsername: Map<string, string>): string => {
  const who = item.systemGenerated
    ? 'System generated'
    : `by ${nameByUsername.get(item.eventUserId) ?? item.eventUserId}`
  return item.actingEstablishmentName ? `${who}, ${item.actingEstablishmentName}` : who
}

// Events that remove the container — a removed container reports no live storage location.
const REMOVAL_EVENTS = ['RETURNED', 'DISPOSED', 'CREATED_IN_ERROR']

// The details block's location row is worded by event: a transfer names the destination establishment,
// a removal reads "Removed", otherwise the current storage location.
const detailsLocation = (item: PrisonerTimelineItem): { locationLabel: string; location: string | null } => {
  if (item.eventType === 'TRANSFERRED') {
    return { locationLabel: 'Transferred to', location: item.toPrisonName ?? 'another establishment' }
  }
  if (item.eventType && REMOVAL_EVENTS.includes(item.eventType)) {
    return { locationLabel: 'Storage location', location: 'Removed' }
  }
  return { locationLabel: 'Storage location', location: item.containerLocationDescription }
}

const timelineDetails = (item: PrisonerTimelineItem, prisonerNumber: string): TimelineDetails | null => {
  if (item.itemType !== 'CONTAINER_EVENT' || !item.containerId) return null
  return {
    containerType: item.containerType ? containerTypeLabel(item.containerType) : '-',
    sealNumber: item.containerSealNumber,
    status: item.containerStatus ? timelineTag(item.containerStatus) : null,
    ...detailsLocation(item),
    historyUrl: `/prisoner/${prisonerNumber}/container/${item.containerId}`,
  }
}

/**
 * Build the render-ready timeline rows for the property-history tab. `nameByUsername` maps acting-user
 * usernames to display names (see `UserService.getUserDisplayNames`); it defaults to empty so callers
 * that have not resolved names still get the raw username in the byline.
 */
export const buildPrisonerTimeline = (
  items: PrisonerTimelineItem[],
  prisonerNumber: string,
  nameByUsername: Map<string, string> = new Map(),
): TimelineRow[] =>
  items.map(item => ({
    title: timelineTitle(item),
    tag: item.eventStatus ? timelineTag(item.eventStatus) : null,
    byline: timelineByline(item, nameByUsername),
    dateTime: item.eventDateTime,
    details: timelineDetails(item, prisonerNumber),
  }))

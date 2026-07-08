import type { ContainerStatus, PrisonerTimelineItem } from '../data/prisonerPropertyApiTypes'
import { containerTypeLabel } from './propertyList'

export interface TimelineTag {
  text: string
  classes: string
}

export interface TimelineDetails {
  containerType: string
  sealNumber: string | null
  status: TimelineTag | null
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
    return `${item.prisonerName ?? 'This person'} arrived at ${item.toPrisonName ?? 'another establishment'}`
  }

  const container = containerPrefix(item.sealNumber)
  const establishment = item.actingEstablishmentName ?? 'this establishment'
  const toPrison = item.toPrisonName ?? 'another establishment'

  switch (item.eventType) {
    case 'CREATED_SEALED':
      return `${container} added to storage at ${establishment}`
    case 'SEAL_CHANGED':
      return item.sealNumber
        ? `Property container seal changed to ${item.sealNumber}`
        : 'Property container seal changed'
    case 'CONTAINER_TYPE_CHANGE':
      return `${container} property type changed`
    case 'MOVED':
      return item.toStorageLocationType === 'BRANSTON'
        ? `${container} moved to Branston (offsite)`
        : `${container} moved to a new storage location`
    case 'PRISONER_RECEIVED':
      return `${container} due for transfer out to ${toPrison}`
    case 'TRANSFERRED':
      return `${container} transferred to ${toPrison}`
    case 'RETURNED':
      return `${container} returned to the prisoner`
    case 'DISPOSAL_REQUIRED':
      return `${container} due for disposal at ${establishment}`
    case 'DISPOSED':
      return `${container} disposed of`
    case 'COMBINED':
      return `${container} combined into another container`
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

const timelineDetails = (item: PrisonerTimelineItem, prisonerNumber: string): TimelineDetails | null => {
  if (item.itemType !== 'CONTAINER_EVENT' || !item.containerId) return null
  return {
    containerType: item.containerType ? containerTypeLabel(item.containerType) : '-',
    sealNumber: item.containerSealNumber,
    status: item.containerStatus ? timelineTag(item.containerStatus) : null,
    location: item.containerLocationDescription,
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

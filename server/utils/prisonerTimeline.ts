import type { PrisonerTimelineItem } from '../data/prisonerPropertyApiTypes'
import { containerTypeLabel } from './propertyList'
import { containerStatusTag, type StatusTag } from './statusTags'
import { formatDate } from './utils'

export type TimelineTag = StatusTag

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

const containerPrefix = (seal: string | null): string => (seal ? `Property container ${seal}` : 'Property container')

/** The title sentence for a timeline item, using the resolved prison names and seal-as-of-event. */
const timelineTitle = (item: PrisonerTimelineItem): string => {
  if (item.itemType === 'PRISONER_MOVEMENT') {
    const prison = item.toPrisonName ?? 'another establishment'
    const arrival = item.movementKind === 'TRANSFER_IN' ? `Transferred in to ${prison}` : `Admitted to ${prison}`
    // The receiving establishment's property system at that date: DPS or NOMIS.
    return item.propertySystem ? `${arrival} — property managed in ${item.propertySystem}` : arrival
  }

  if (item.itemType === 'SCHEDULED_FOR_RELEASE') {
    return `Scheduled for release on ${formatDate(item.eventDate)}`
  }

  if (item.itemType === 'DPS_FIRST_USED') {
    return `Property management started in DPS at ${item.toPrisonName ?? 'this establishment'}`
  }

  const container = containerPrefix(item.sealNumber)
  const establishment = item.actingEstablishmentName ?? 'this establishment'
  const toPrison = item.toPrisonName ?? 'another establishment'

  switch (item.eventType) {
    case 'CREATED_SEALED':
      // A related seal here means the container was logged as property arriving on transfer and matched to
      // the record it was held under at the sending prison.
      return item.relatedContainerSealNumber
        ? `${container} added to storage at ${establishment}, matched to previous seal number ${item.relatedContainerSealNumber}`
        : `${container} added to storage at ${establishment}`
    case 'SEAL_CHANGED':
      // The container is identified by its (new) seal, so avoid repeating it as a prefix.
      return item.sealNumber
        ? `Property container details changed — seal number now ${item.sealNumber}`
        : 'Property container details changed — seal number'
    case 'CONTAINER_TYPE_CHANGE': {
      // Mirrors the "seal number now X" idiom above. The API supplies what the type was changed from where
      // it can determine it; where it cannot, the title just names the new type.
      if (!item.containerType) return `${container} details changed — property type`
      const now = `${container} details changed — property type now ${containerTypeLabel(item.containerType)}`
      return item.previousContainerType ? `${now} (was ${containerTypeLabel(item.previousContainerType)})` : now
    }
    case 'MOVED':
      return item.toStorageLocationType === 'BRANSTON'
        ? `${container} moved to Branston (offsite)`
        : `${container} storage location changed`
    case 'PRISONER_RECEIVED':
      return `${container} due for transfer out to ${toPrison}`
    case 'PRISONER_RELEASED':
      return `${container} due for return`
    case 'DIED_IN_CUSTODY':
      return `${container} due for return following death in custody`
    case 'TRANSFERRED':
      return item.relatedContainerSealNumber
        ? `${container} transferred out to ${toPrison}, matched to new seal number ${item.relatedContainerSealNumber}`
        : `${container} transferred out to ${toPrison}`
    case 'RETURNED':
      return `${container} returned to the person`
    case 'DISPOSAL_REQUIRED':
      return `${container} due for disposal`
    case 'DISPOSED':
      return `${container} disposed of`
    case 'COMBINED':
      return item.relatedContainerSealNumber
        ? `${container} combined into property container ${item.relatedContainerSealNumber}`
        : `${container} combined into another container`
    case 'CREATED_IN_ERROR':
      return `${container} removed — created in error`
    case 'REMOVED':
      return `${container} marked as removed from the establishment`
    case 'REACTIVATED':
      return `${container} reactivated`
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
const REMOVAL_EVENTS = ['RETURNED', 'DISPOSED', 'CREATED_IN_ERROR', 'REMOVED']

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
    status: item.containerStatus ? containerStatusTag(item.containerStatus) : null,
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
    tag: item.eventStatus ? containerStatusTag(item.eventStatus) : null,
    byline: timelineByline(item, nameByUsername),
    dateTime: item.eventDateTime,
    details: timelineDetails(item, prisonerNumber),
  }))

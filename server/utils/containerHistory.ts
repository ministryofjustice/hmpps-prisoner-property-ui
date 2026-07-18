import type { PropertyEvent, PropertyEventType } from '../data/prisonerPropertyApiTypes'
import { containerTypeLabel } from './propertyList'
import { formatDate } from './utils'

const EVENT_TYPE_LABELS: Record<PropertyEventType, string> = {
  CREATED_SEALED: 'Added to storage',
  SEAL_CHANGED: 'Details changed',
  CONTAINER_TYPE_CHANGE: 'Details changed',
  MOVED: 'Storage location changed',
  PRISONER_RECEIVED: 'Due for transfer out',
  PRISONER_RELEASED: 'Due for return',
  DIED_IN_CUSTODY: 'Due for return – death in custody',
  TRANSFERRED: 'Removed – transferred out',
  RETURNED: 'Removed – returned',
  DISPOSAL_REQUIRED: 'Due for disposal',
  DISPOSED: 'Removed – disposed',
  COMBINED: 'Combined',
  CREATED_IN_ERROR: 'Removed – created in error',
  REMOVED: 'Removed from the establishment',
  REACTIVATED: 'Reactivated',
}

export const eventTypeLabel = (type: PropertyEventType): string => EVENT_TYPE_LABELS[type] ?? type

/**
 * A human-readable description of a single history event. Only fields relevant to the event type are
 * populated by the API, so we describe what we know. Internal storage-location ids are not resolved to
 * names yet (deferred to a follow-up), so a move to an internal location is described generically.
 */
export const eventDescription = (event: PropertyEvent): string => {
  switch (event.eventType) {
    case 'CREATED_SEALED':
      return event.sealNumber ? `Added to storage with seal number ${event.sealNumber}.` : 'Added to storage.'
    case 'SEAL_CHANGED':
      return event.sealNumber ? `Seal number changed to ${event.sealNumber}.` : 'Seal number changed.'
    case 'CONTAINER_TYPE_CHANGE':
      // containerType is snapshotted as at this event, so it names what the type was changed to.
      return event.containerType
        ? `Property type changed to ${containerTypeLabel(event.containerType)}.`
        : 'Property type changed.'
    case 'MOVED':
      return event.toStorageLocationType === 'BRANSTON'
        ? 'Moved to Branston (offsite).'
        : 'Moved to a new storage location.'
    case 'PRISONER_RECEIVED':
      return 'The person was received at another establishment, so this property is due to be transferred out.'
    case 'PRISONER_RELEASED':
      return 'The person was released, so this property is due to be returned.'
    case 'DIED_IN_CUSTODY':
      return "Following the person's death in custody, this property is due to be returned."
    case 'TRANSFERRED': {
      // Prefer the resolved prison name; fall back to the id if the API hasn't resolved it yet.
      const destination = event.toPrisonName ?? event.toPrisonId
      return destination
        ? `Transferred to another establishment (${destination}).`
        : 'Transferred to another establishment.'
    }
    case 'RETURNED':
      return 'Returned to the person.'
    case 'DISPOSAL_REQUIRED':
      // Records that a proposed disposal date was set - which may be in the future - not that it has been
      // reached. The container only becomes "due for disposal" once that date arrives (a derived status).
      return event.eventDate
        ? `Proposed disposal date set to ${formatDate(event.eventDate)}.`
        : 'Proposed disposal date set.'
    case 'DISPOSED':
      return 'Disposed of.'
    case 'COMBINED':
      return event.relatedContainerSealNumber
        ? `Combined into property container ${event.relatedContainerSealNumber}.`
        : 'Combined into another container.'
    case 'CREATED_IN_ERROR':
      return 'Removed because the record was created in error.'
    case 'REMOVED':
      // NOMIS marked the property inactive - removed from the prison, reason unknown (returned, disposed or
      // transferred - NOMIS does not record which).
      return 'Marked as removed from the establishment.'
    case 'REACTIVATED':
      return 'Reactivated and returned to active storage.'
    default:
      return ''
  }
}

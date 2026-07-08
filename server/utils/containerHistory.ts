import type { PropertyEvent, PropertyEventType } from '../data/prisonerPropertyApiTypes'
import { formatDate } from './utils'

const EVENT_TYPE_LABELS: Record<PropertyEventType, string> = {
  CREATED_SEALED: 'Added to storage',
  SEAL_CHANGED: 'Details changed',
  CONTAINER_TYPE_CHANGE: 'Details changed',
  MOVED: 'Storage location changed',
  PRISONER_RECEIVED: 'Due for transfer out',
  PRISONER_RELEASED: 'Due for return',
  TRANSFERRED: 'Removed – transferred out',
  RETURNED: 'Removed – returned',
  DISPOSAL_REQUIRED: 'Due for disposal',
  DISPOSED: 'Removed – disposed',
  COMBINED: 'Combined',
  CREATED_IN_ERROR: 'Removed – created in error',
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
      return 'Property type changed.'
    case 'MOVED':
      return event.toStorageLocationType === 'BRANSTON'
        ? 'Moved to Branston (offsite).'
        : 'Moved to a new storage location.'
    case 'PRISONER_RECEIVED':
      return 'The person was received at another establishment, so this property is due to be transferred out.'
    case 'PRISONER_RELEASED':
      return 'The person was released, so this property is due to be returned.'
    case 'TRANSFERRED':
      // The single-container events API returns the prison id, not a resolved name (unlike the timeline).
      return event.toPrisonId
        ? `Transferred to another establishment (${event.toPrisonId}).`
        : 'Transferred to another establishment.'
    case 'RETURNED':
      return 'Returned to the person.'
    case 'DISPOSAL_REQUIRED':
      return event.eventDate
        ? `Disposal date reached (${formatDate(event.eventDate)}), so this property is due to be disposed of.`
        : 'Property due to be disposed of.'
    case 'DISPOSED':
      return 'Disposed of.'
    case 'COMBINED':
      return 'Combined into another container.'
    case 'CREATED_IN_ERROR':
      return 'Removed because the record was created in error.'
    default:
      return ''
  }
}

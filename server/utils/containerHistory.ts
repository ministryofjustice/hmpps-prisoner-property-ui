import type { PropertyEvent, PropertyEventType } from '../data/prisonerPropertyApiTypes'
import { formatDate } from './utils'

const EVENT_TYPE_LABELS: Record<PropertyEventType, string> = {
  CREATED_SEALED: 'Created and sealed',
  SEAL_CHANGED: 'Seal changed',
  CONTAINER_TYPE_CHANGE: 'Property type changed',
  MOVED: 'Moved',
  PRISONER_RECEIVED: 'Prisoner received at establishment',
  TRANSFERRED: 'Transferred out',
  RETURNED: 'Returned to prisoner',
  DISPOSAL_REQUIRED: 'Marked for disposal',
  DISPOSED: 'Disposed',
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
      return event.sealNumber
        ? `Container created and sealed with seal number ${event.sealNumber}.`
        : 'Container created and sealed.'
    case 'SEAL_CHANGED':
      return event.sealNumber ? `Seal number changed to ${event.sealNumber}.` : 'Seal number changed.'
    case 'CONTAINER_TYPE_CHANGE':
      return 'Property type changed.'
    case 'MOVED':
      return event.toStorageLocationType === 'BRANSTON'
        ? 'Moved to Branston (offsite).'
        : 'Moved to a new storage location.'
    case 'PRISONER_RECEIVED':
      return 'Prisoner received at this establishment; property due for transfer out.'
    case 'TRANSFERRED':
      return event.toPrisonId ? `Transferred out to ${event.toPrisonId}.` : 'Transferred out.'
    case 'RETURNED':
      return 'Returned to the prisoner.'
    case 'DISPOSAL_REQUIRED':
      return event.eventDate ? `Marked for disposal (proposed ${formatDate(event.eventDate)}).` : 'Marked for disposal.'
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

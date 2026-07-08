import type { PropertyEvent } from '../data/prisonerPropertyApiTypes'
import { eventDescription, eventTypeLabel } from './containerHistory'

const event = (overrides: Partial<PropertyEvent>): PropertyEvent => ({
  id: 'e1',
  eventType: 'CREATED_SEALED',
  eventDateTime: '2026-06-01T10:00:00',
  eventUserId: 'AUSER',
  sealNumber: null,
  fromInternalLocationId: null,
  toInternalLocationId: null,
  toStorageLocationType: null,
  fromPrisonId: null,
  toPrisonId: null,
  eventDate: null,
  relatedContainerId: null,
  ...overrides,
})

describe('eventTypeLabel', () => {
  it('maps known event types to labels', () => {
    expect(eventTypeLabel('CREATED_SEALED')).toBe('Added to storage')
    expect(eventTypeLabel('MOVED')).toBe('Storage location changed')
    expect(eventTypeLabel('DISPOSED')).toBe('Removed – disposed')
  })

  it('labels the "details changed" events the same and groups removals', () => {
    expect(eventTypeLabel('SEAL_CHANGED')).toBe('Details changed')
    expect(eventTypeLabel('CONTAINER_TYPE_CHANGE')).toBe('Details changed')
    expect(eventTypeLabel('TRANSFERRED')).toBe('Removed – transferred out')
    expect(eventTypeLabel('RETURNED')).toBe('Removed – returned')
    expect(eventTypeLabel('CREATED_IN_ERROR')).toBe('Removed – created in error')
  })
})

describe('eventDescription', () => {
  it('describes an added-to-storage event with its seal number', () => {
    expect(eventDescription(event({ eventType: 'CREATED_SEALED', sealNumber: 'SN0001' }))).toBe(
      'Added to storage with seal number SN0001.',
    )
  })

  it('describes a seal change', () => {
    expect(eventDescription(event({ eventType: 'SEAL_CHANGED', sealNumber: 'SN0002' }))).toBe(
      'Seal number changed to SN0002.',
    )
  })

  it('distinguishes a Branston move from an internal move', () => {
    expect(eventDescription(event({ eventType: 'MOVED', toStorageLocationType: 'BRANSTON' }))).toBe(
      'Moved to Branston (offsite).',
    )
    expect(eventDescription(event({ eventType: 'MOVED', toStorageLocationType: 'INTERNAL' }))).toBe(
      'Moved to a new storage location.',
    )
  })

  it('describes the received and released events in person-centred terms', () => {
    expect(eventDescription(event({ eventType: 'PRISONER_RECEIVED' }))).toBe(
      'The person was received at another establishment, so this property is due to be transferred out.',
    )
    expect(eventDescription(event({ eventType: 'PRISONER_RELEASED' }))).toBe(
      'The person was released, so this property is due to be returned.',
    )
  })

  it('shows the destination prison id on a transfer (name is not available in the events API)', () => {
    expect(eventDescription(event({ eventType: 'TRANSFERRED', toPrisonId: 'MDI' }))).toBe(
      'Transferred to another establishment (MDI).',
    )
    expect(eventDescription(event({ eventType: 'TRANSFERRED', toPrisonId: null }))).toBe(
      'Transferred to another establishment.',
    )
  })

  it('includes the reached date when due for disposal', () => {
    expect(eventDescription(event({ eventType: 'DISPOSAL_REQUIRED', eventDate: '2026-09-01' }))).toBe(
      'Disposal date reached (1 September 2026), so this property is due to be disposed of.',
    )
  })

  it('describes returned, disposed and combined events', () => {
    expect(eventDescription(event({ eventType: 'RETURNED' }))).toBe('Returned to the person.')
    expect(eventDescription(event({ eventType: 'DISPOSED' }))).toBe('Disposed of.')
    expect(eventDescription(event({ eventType: 'COMBINED' }))).toBe('Combined into another container.')
  })
})

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
    expect(eventTypeLabel('CREATED_SEALED')).toBe('Created and sealed')
    expect(eventTypeLabel('MOVED')).toBe('Moved')
    expect(eventTypeLabel('DISPOSED')).toBe('Disposed')
  })
})

describe('eventDescription', () => {
  it('describes a created & sealed event with its seal number', () => {
    expect(eventDescription(event({ eventType: 'CREATED_SEALED', sealNumber: 'SN0001' }))).toBe(
      'Container created and sealed with seal number SN0001.',
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

  it('names the destination prison on a transfer', () => {
    expect(eventDescription(event({ eventType: 'TRANSFERRED', toPrisonId: 'MDI' }))).toBe('Transferred out to MDI.')
    expect(eventDescription(event({ eventType: 'TRANSFERRED', toPrisonId: null }))).toBe('Transferred out.')
  })

  it('includes the proposed date when marking for disposal', () => {
    expect(eventDescription(event({ eventType: 'DISPOSAL_REQUIRED', eventDate: '2026-09-01' }))).toBe(
      'Marked for disposal (proposed 1 September 2026).',
    )
  })

  it('describes returned, disposed and combined events', () => {
    expect(eventDescription(event({ eventType: 'RETURNED' }))).toBe('Returned to the prisoner.')
    expect(eventDescription(event({ eventType: 'DISPOSED' }))).toBe('Disposed of.')
    expect(eventDescription(event({ eventType: 'COMBINED' }))).toBe('Combined into another container.')
  })
})

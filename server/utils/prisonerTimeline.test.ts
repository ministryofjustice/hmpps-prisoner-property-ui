import type { PrisonerTimelineItem, PropertyEventType } from '../data/prisonerPropertyApiTypes'
import { buildPrisonerTimeline } from './prisonerTimeline'

const containerEvent = (overrides: Partial<PrisonerTimelineItem> = {}): PrisonerTimelineItem => ({
  itemType: 'CONTAINER_EVENT',
  eventId: 'e1',
  eventType: 'CREATED_SEALED',
  eventStatus: 'STORED',
  eventDateTime: '2026-06-01T10:00:00',
  eventDate: null,
  eventUserId: 'AUSER',
  systemGenerated: false,
  prisonerName: null,
  actingEstablishmentName: 'Leeds (HMP)',
  fromPrisonName: null,
  toPrisonName: null,
  toStorageLocationType: null,
  sealNumber: 'SN880032',
  relatedContainerId: null,
  containerId: 'c1',
  containerType: 'VALUABLES',
  containerSealNumber: 'SN880032',
  containerStatus: 'STORED',
  containerLocationDescription: 'Reception A1',
  ...overrides,
})

const movement = (overrides: Partial<PrisonerTimelineItem> = {}): PrisonerTimelineItem =>
  containerEvent({
    itemType: 'PRISONER_MOVEMENT',
    eventType: null,
    eventStatus: null,
    systemGenerated: true,
    prisonerName: 'JOHN SMITH',
    actingEstablishmentName: 'Moorland (HMP & YOI)',
    toPrisonName: 'Moorland (HMP & YOI)',
    sealNumber: null,
    containerId: null,
    containerType: null,
    containerSealNumber: null,
    containerStatus: null,
    containerLocationDescription: null,
    ...overrides,
  })

const titleFor = (eventType: PropertyEventType, overrides: Partial<PrisonerTimelineItem> = {}): string =>
  buildPrisonerTimeline([containerEvent({ eventType, ...overrides })], 'A1234BC')[0].title

describe('buildPrisonerTimeline', () => {
  it('builds a title sentence per event type using the resolved names and seal', () => {
    expect(titleFor('CREATED_SEALED')).toBe('Property container SN880032 added to storage at Leeds (HMP)')
    expect(titleFor('SEAL_CHANGED')).toBe('Property container details changed — seal number now SN880032')
    expect(titleFor('CONTAINER_TYPE_CHANGE')).toBe('Property container SN880032 details changed — property type')
    expect(titleFor('MOVED')).toBe('Property container SN880032 storage location changed')
    expect(titleFor('MOVED', { toStorageLocationType: 'BRANSTON' })).toBe(
      'Property container SN880032 moved to Branston (offsite)',
    )
    expect(titleFor('PRISONER_RECEIVED', { toPrisonName: 'Moorland (HMP & YOI)' })).toBe(
      'Property container SN880032 due for transfer out to Moorland (HMP & YOI)',
    )
    expect(titleFor('PRISONER_RELEASED')).toBe('Property container SN880032 due for return')
    expect(titleFor('TRANSFERRED', { toPrisonName: 'Isle of Wight (HMP)' })).toBe(
      'Property container SN880032 transferred out to Isle of Wight (HMP)',
    )
    expect(titleFor('RETURNED')).toBe('Property container SN880032 returned to the person')
    expect(titleFor('DISPOSAL_REQUIRED')).toBe('Property container SN880032 due for disposal')
    expect(titleFor('DISPOSED')).toBe('Property container SN880032 disposed of')
    expect(titleFor('COMBINED')).toBe('Property container SN880032 combined into another container')
    expect(titleFor('CREATED_IN_ERROR')).toBe('Property container SN880032 removed — created in error')
  })

  it('omits the seal from the title when it is not known', () => {
    expect(titleFor('CREATED_SEALED', { sealNumber: null })).toBe('Property container added to storage at Leeds (HMP)')
  })

  it('renders a scheduled-for-release item from its release date, with no tag or details', () => {
    const [row] = buildPrisonerTimeline(
      [
        containerEvent({
          itemType: 'SCHEDULED_FOR_RELEASE',
          eventType: null,
          eventStatus: null,
          eventDate: '2026-08-12',
        }),
      ],
      'A1234BC',
    )
    expect(row.title).toBe('Scheduled for release on 12 August 2026')
    expect(row.tag).toBeNull()
    expect(row.details).toBeNull()
  })

  it('maps the event status to a tag, and leaves movement items untagged', () => {
    const [event] = buildPrisonerTimeline([containerEvent({ eventStatus: 'TRANSFER' })], 'A1234BC')
    expect(event.tag).toEqual({ text: 'Transferred out', classes: 'govuk-tag--grey' })

    const [move] = buildPrisonerTimeline([movement()], 'A1234BC')
    expect(move.tag).toBeNull()
  })

  it('builds the byline from the user and acting establishment, or flags system-generated events', () => {
    expect(buildPrisonerTimeline([containerEvent()], 'A1234BC')[0].byline).toBe('by AUSER, Leeds (HMP)')
    expect(buildPrisonerTimeline([containerEvent({ systemGenerated: true })], 'A1234BC')[0].byline).toBe(
      'System generated, Leeds (HMP)',
    )
  })

  it('resolves the acting user to their name when supplied, and falls back to the raw username', () => {
    const names = new Map([['AUSER', 'John Doe']])
    expect(buildPrisonerTimeline([containerEvent()], 'A1234BC', names)[0].byline).toBe('by John Doe, Leeds (HMP)')
    expect(buildPrisonerTimeline([containerEvent({ eventUserId: 'BUSER' })], 'A1234BC', names)[0].byline).toBe(
      'by BUSER, Leeds (HMP)',
    )
  })

  it('renders a prisoner movement as an "arrived at" row with no container details', () => {
    const [row] = buildPrisonerTimeline([movement()], 'A1234BC')
    expect(row.title).toBe('JOHN SMITH arrived at Moorland (HMP & YOI)')
    expect(row.byline).toBe('System generated, Moorland (HMP & YOI)')
    expect(row.details).toBeNull()
  })

  it('exposes the container summary and history link in the expandable details', () => {
    const [row] = buildPrisonerTimeline([containerEvent()], 'A1234BC')
    expect(row.details).toEqual({
      containerType: 'Valuables',
      sealNumber: 'SN880032',
      status: { text: 'Stored', classes: 'govuk-tag--green' },
      locationLabel: 'Storage location',
      location: 'Reception A1',
      historyUrl: '/prisoner/A1234BC/container/c1',
    })
  })

  it('words the details location row by event: transfer names the destination, a removal reads "Removed"', () => {
    const [transfer] = buildPrisonerTimeline(
      [containerEvent({ eventType: 'TRANSFERRED', toPrisonName: 'Isle of Wight (HMP)' })],
      'A1234BC',
    )
    expect(transfer.details).toMatchObject({ locationLabel: 'Transferred to', location: 'Isle of Wight (HMP)' })

    const [returned] = buildPrisonerTimeline([containerEvent({ eventType: 'RETURNED' })], 'A1234BC')
    expect(returned.details).toMatchObject({ locationLabel: 'Storage location', location: 'Removed' })
  })
})

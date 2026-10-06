import type { PrisonerPropertyContainer, PrisonerTimelineItem } from '../data/prisonerPropertyApiTypes'
import {
  canAddPropertyHere,
  decidePrisonerAccess,
  type PrisonerAccessInput,
  scopeContainers,
  scopeTimeline,
} from './prisonerAccess'

const container = (overrides: Partial<PrisonerPropertyContainer>): PrisonerPropertyContainer => ({
  id: 'c1',
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  inPrisonersCurrentPrison: true,
  containerType: 'STANDARD',
  currentSealNumber: 'SN0001',
  currentStatus: 'STORED',
  currentLocation: null,
  currentLocationType: 'INTERNAL',
  locationDescription: 'Reception A1',
  proposedDisposalDate: null,
  removalOutcome: null,
  removalDate: null,
  createDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
  ...overrides,
})

const timelineItem = (overrides: Partial<PrisonerTimelineItem>): PrisonerTimelineItem =>
  ({ itemType: 'CONTAINER_EVENT', eventId: 'e1', containerId: 'c1', ...overrides }) as PrisonerTimelineItem

// A user at Moorland, holding only Moorland, with no special roles.
const input = (overrides: Partial<PrisonerAccessInput>): PrisonerAccessInput => ({
  prisonerPrisonId: 'MDI',
  caseloadIds: ['MDI'],
  activeCaseloadId: 'MDI',
  userRoles: [],
  containers: [],
  ...overrides,
})

describe('decidePrisonerAccess', () => {
  it('gives full access when the prisoner is in the active caseload', () => {
    expect(decidePrisonerAccess(input({}))).toBe('FULL')
  })

  it('gives full access when the prisoner is in another of the user caseloads', () => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: 'LEI', caseloadIds: ['MDI', 'LEI'] }))).toBe('FULL')
  })

  it.each(['OUT', 'TRN'])('gives full access at %s with the released prisoner viewing role', prisonId => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: prisonId, userRoles: ['INACTIVE_BOOKINGS'] }))).toBe('FULL')
  })

  it.each(['OUT', 'TRN'])('refuses %s without the role or property here', prisonId => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: prisonId }))).toBeNull()
  })

  it('does not let the released prisoner viewing role open someone held at another prison', () => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: 'LEI', userRoles: ['INACTIVE_BOOKINGS'] }))).toBeNull()
  })

  it('gives this-prison-only access when property is held here', () => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: 'LEI', containers: [container({ prisonId: 'MDI' })] }))).toBe(
      'THIS_PRISON_ONLY',
    )
  })

  it('counts property no longer held here', () => {
    expect(
      decidePrisonerAccess(
        input({ prisonerPrisonId: 'OUT', containers: [container({ prisonId: 'MDI', removalOutcome: 'RETURNED' })] }),
      ),
    ).toBe('THIS_PRISON_ONLY')
  })

  it('counts only property at the active caseload, not at other caseloads the user holds', () => {
    expect(
      decidePrisonerAccess(
        input({ prisonerPrisonId: 'OUT', caseloadIds: ['MDI', 'LEI'], containers: [container({ prisonId: 'LEI' })] }),
      ),
    ).toBeNull()
  })

  it('refuses a prisoner elsewhere whose property is all elsewhere', () => {
    expect(
      decidePrisonerAccess(input({ prisonerPrisonId: 'LEI', containers: [container({ prisonId: 'LEI' })] })),
    ).toBeNull()
  })

  it('relies on property here alone when the current prison is unknown', () => {
    expect(decidePrisonerAccess(input({ prisonerPrisonId: null }))).toBeNull()
    expect(decidePrisonerAccess(input({ prisonerPrisonId: null, containers: [container({})] }))).toBe(
      'THIS_PRISON_ONLY',
    )
  })
})

describe('canAddPropertyHere', () => {
  it('allows a prisoner held here', () => {
    expect(canAddPropertyHere('MDI', 'MDI', [])).toBe(true)
  })

  it('allows a prisoner elsewhere who has property here', () => {
    expect(canAddPropertyHere('OUT', 'MDI', [container({ prisonId: 'MDI', removalOutcome: 'RETURNED' })])).toBe(true)
  })

  it('refuses a prisoner with no link to this prison', () => {
    expect(canAddPropertyHere('LEI', 'MDI', [container({ prisonId: 'LEI' })])).toBe(false)
    expect(canAddPropertyHere(null, 'MDI', [])).toBe(false)
  })
})

describe('scopeContainers', () => {
  const here = container({ id: 'here', prisonId: 'MDI' })
  const leeds = container({ id: 'leeds', prisonId: 'LEI' })

  it('keeps everything for full access', () => {
    expect(scopeContainers([here, leeds], 'FULL', 'MDI')).toEqual([here, leeds])
  })

  it('keeps only property at this prison otherwise', () => {
    expect(scopeContainers([here, leeds], 'THIS_PRISON_ONLY', 'MDI')).toEqual([here])
  })
})

describe('scopeTimeline', () => {
  const items = [
    timelineItem({ eventId: 'here', containerId: 'here' }),
    timelineItem({ eventId: 'leeds', containerId: 'leeds' }),
    timelineItem({ eventId: 'move', itemType: 'PRISONER_MOVEMENT', containerId: null }),
    timelineItem({ eventId: 'release', itemType: 'SCHEDULED_FOR_RELEASE', containerId: null }),
  ]

  it('keeps everything for full access', () => {
    expect(scopeTimeline(items, 'FULL', [])).toEqual(items)
  })

  it('keeps only the events of visible containers otherwise', () => {
    expect(scopeTimeline(items, 'THIS_PRISON_ONLY', [container({ id: 'here' })]).map(item => item.eventId)).toEqual([
      'here',
    ])
  })
})

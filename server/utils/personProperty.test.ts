import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'
import { partitionContainers, removalOutcomeLabel, resolveCurrentPrisonName } from './personProperty'

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
  archived: false,
  ...overrides,
})

describe('removalOutcomeLabel', () => {
  it.each([
    ['DISPOSED', 'Disposed'],
    ['RETURNED', 'Returned'],
    ['TRANSFERRED', 'Transferred'],
    ['COMBINED', 'Combined'],
  ] as const)('maps %s to %s', (outcome, label) => {
    expect(removalOutcomeLabel(outcome)).toBe(label)
  })
})

describe('partitionContainers', () => {
  it('splits containers into active (no removal outcome) and past (removed)', () => {
    const active = container({ id: 'a', removalOutcome: null })
    const past = container({ id: 'p', removalOutcome: 'RETURNED', removalDate: '2026-06-20' })

    const result = partitionContainers([active, past])

    expect(result.active).toEqual([active])
    expect(result.past).toEqual([past])
  })

  it('returns empty arrays for no containers', () => {
    expect(partitionContainers([])).toEqual({ active: [], past: [] })
  })
})

describe('resolveCurrentPrisonName', () => {
  it('prefers the authoritative prisonerCurrentPrisonName even when no property is held there', () => {
    const containers = [
      container({
        inPrisonersCurrentPrison: false,
        prisonName: 'Leeds (HMP)',
        prisonerCurrentPrisonName: 'Isle of Wight (HMP)',
      }),
    ]
    expect(resolveCurrentPrisonName(containers)).toBe('Isle of Wight (HMP)')
  })

  it('falls back to the holding prison of a container in the prisoners current prison', () => {
    const containers = [
      container({ inPrisonersCurrentPrison: false, prisonName: 'Leeds (HMP)', prisonerCurrentPrisonName: null }),
      container({
        inPrisonersCurrentPrison: true,
        prisonName: 'Moorland (HMP & YOI)',
        prisonerCurrentPrisonName: null,
      }),
    ]
    expect(resolveCurrentPrisonName(containers)).toBe('Moorland (HMP & YOI)')
  })

  it('returns null when neither the field nor a held container is available', () => {
    const containers = [container({ inPrisonersCurrentPrison: false, prisonName: 'Leeds (HMP)' })]
    expect(resolveCurrentPrisonName(containers)).toBeNull()
  })

  it('returns null for no containers', () => {
    expect(resolveCurrentPrisonName([])).toBeNull()
  })
})

import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'
import {
  buildPersonPropertyView,
  buildReturnedOrTransferredView,
  partitionContainers,
  removalOutcomeLabel,
  resolveCurrentPrisonName,
} from './personProperty'

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

describe('buildReturnedOrTransferredView', () => {
  it('keeps only removed/returned/disposed/transferred containers, newest first, with a status tag', () => {
    const active = container({ id: 'active', removalOutcome: null })
    const combined = container({ id: 'combined', removalOutcome: 'COMBINED', currentStatus: 'COMBINED' })
    const createdInError = container({
      id: 'error',
      removalOutcome: 'CREATED_IN_ERROR',
      currentStatus: 'CREATED_IN_ERROR',
    })
    const returned = container({
      id: 'returned',
      removalOutcome: 'RETURNED',
      currentStatus: 'RETURNED',
      removalDate: '2026-06-10',
    })
    const transferred = container({
      id: 'transferred',
      removalOutcome: 'TRANSFERRED',
      currentStatus: 'TRANSFER',
      removalDate: '2026-06-20',
    })
    const disposed = container({
      id: 'disposed',
      removalOutcome: 'DISPOSED',
      currentStatus: 'DISPOSED',
      removalDate: '2026-06-15',
    })
    const removed = container({
      id: 'removed',
      removalOutcome: 'REMOVED',
      currentStatus: 'REMOVED',
      removalDate: '2026-06-05',
    })

    const rows = buildReturnedOrTransferredView([
      active,
      combined,
      createdInError,
      returned,
      transferred,
      disposed,
      removed,
    ])

    // Active, combined and created-in-error excluded; the rest ordered by removal date descending.
    expect(rows.map(r => r.container.id)).toEqual(['transferred', 'disposed', 'returned', 'removed'])
    expect(rows.find(r => r.container.id === 'transferred')!.status).toEqual({
      text: 'Transferred out',
      classes: 'govuk-tag--grey',
    })
    expect(rows.find(r => r.container.id === 'returned')!.status).toEqual({
      text: 'Returned',
      classes: 'govuk-tag--green',
    })
    expect(rows.find(r => r.container.id === 'disposed')!.status).toEqual({
      text: 'Disposed',
      classes: 'govuk-tag--red',
    })
    expect(rows.find(r => r.container.id === 'removed')!.status).toEqual({
      text: 'Removed',
      classes: 'govuk-tag--grey',
    })
  })

  it('returns an empty array when the person has no returned or transferred property', () => {
    expect(buildReturnedOrTransferredView([container({ removalOutcome: null })])).toEqual([])
  })

  // A transfer still in flight has left the sending prison, so it belongs in this history too - even
  // though it also shows as "In transit" on the destination's incoming list.
  it('includes a transfer that the destination has not logged yet', () => {
    const inFlight = container({
      id: 'in-flight',
      removalOutcome: 'TRANSFERRED',
      currentStatus: 'TRANSFER',
      removalDate: '2026-06-20',
      receivingPrisonId: 'MDI',
    })

    const rows = buildReturnedOrTransferredView([inFlight])

    expect(rows.map(r => r.container.id)).toEqual(['in-flight'])
    expect(rows[0]!.status).toEqual({ text: 'Transferred out', classes: 'govuk-tag--grey' })
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

describe('buildPersonPropertyView', () => {
  // Viewed establishment = MDI throughout.
  it('variant A: prisoner is here - splits held property (Stored) from property due to transfer in', () => {
    const here = container({ id: 'here', prisonId: 'MDI', prisonerCurrentPrisonId: 'MDI', currentStatus: 'STORED' })
    const elsewhere = container({
      id: 'away',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentStatus: 'DUE_FOR_TRANSFER_OUT',
    })

    const view = buildPersonPropertyView([here, elsewhere], 'MDI')

    expect(view.hasLeft).toBe(false)
    expect(view.inEstablishment.map(r => r.container.id)).toEqual(['here'])
    expect(view.inEstablishment[0]!.status).toEqual({ text: 'Stored', classes: 'govuk-tag--green' })
    expect(view.dueToTransferIn.map(r => r.container.id)).toEqual(['away'])
    expect(view.dueToTransferIn[0]!.status).toEqual({ text: 'Due for transfer in', classes: 'govuk-tag--turquoise' })
  })

  it('variant B: prisoner has left - held property becomes Due for transfer out with no transfer-in section', () => {
    const leftBehind = container({
      id: 'left',
      prisonId: 'MDI',
      prisonerCurrentPrisonId: 'IWI',
      prisonerCurrentPrisonName: 'Isle of Wight (HMP)',
      inPrisonersCurrentPrison: false,
      currentStatus: 'DUE_FOR_TRANSFER_OUT',
    })

    const view = buildPersonPropertyView([leftBehind], 'MDI')

    expect(view.hasLeft).toBe(true)
    expect(view.prisonerCurrentPrisonName).toBe('Isle of Wight (HMP)')
    expect(view.inEstablishment[0]!.status).toEqual({ text: 'Due for transfer out', classes: 'govuk-tag--grey' })
    expect(view.dueToTransferIn).toEqual([])
  })

  it('shows Due for disposal regardless of establishment or perspective', () => {
    const hereDisposal = container({
      prisonId: 'MDI',
      prisonerCurrentPrisonId: 'MDI',
      currentStatus: 'DISPOSAL_REQUIRED',
    })
    const awayDisposal = container({
      id: 'away',
      prisonId: 'LEI',
      prisonerCurrentPrisonId: 'MDI',
      currentStatus: 'DISPOSAL_REQUIRED',
    })

    const view = buildPersonPropertyView([hereDisposal, awayDisposal], 'MDI')

    expect(view.inEstablishment[0]!.status.text).toBe('Due for disposal')
    expect(view.dueToTransferIn[0]!.status.text).toBe('Due for disposal')
  })

  it('shows Due for return for a released prisoner’s property held here', () => {
    const released = container({
      prisonId: 'MDI',
      prisonerCurrentPrisonId: 'OUT',
      inPrisonersCurrentPrison: false,
      currentStatus: 'DUE_FOR_RETURN',
    })

    const view = buildPersonPropertyView([released], 'MDI')

    expect(view.inEstablishment[0]!.status).toEqual({ text: 'Due for return', classes: 'govuk-tag--yellow' })
  })

  // The bug this closes: the status was re-derived here from the prisoner's location, and for a released
  // person `prisonerCurrentPrisonId` is the sentinel "OUT" - never the viewed prison - so their property was
  // tagged "Due for transfer out" while the establishment list, reading the API, called it something else.
  // The API owns the rule now, so whatever it says is what both pages show.
  it.each([
    ['STORED', 'Stored'],
    ['DUE_FOR_RETURN', 'Due for return'],
    ['DUE_FOR_TRANSFER_OUT', 'Due for transfer out'],
    ['DISPOSAL_REQUIRED', 'Due for disposal'],
  ] as const)('renders the API status %s for property held here, whoever the owner is', (status, text) => {
    const forEachOwner = ['MDI', 'IWI', 'OUT', 'TRN', null].map(prisonerCurrentPrisonId =>
      buildPersonPropertyView([container({ prisonId: 'MDI', prisonerCurrentPrisonId, currentStatus: status })], 'MDI'),
    )

    forEachOwner.forEach(view => expect(view.inEstablishment[0]!.status.text).toBe(text))
  })

  it('still tells staff the person is no longer here when they have been released', () => {
    const released = container({ prisonId: 'MDI', prisonerCurrentPrisonId: 'OUT', currentStatus: 'DUE_FOR_RETURN' })

    const view = buildPersonPropertyView([released], 'MDI')

    expect(view.hasLeft).toBe(true)
    // Incoming property is only meaningful while they are in this establishment.
    expect(view.dueToTransferIn).toEqual([])
  })

  it('excludes removed containers', () => {
    const removed = container({ prisonId: 'MDI', prisonerCurrentPrisonId: 'MDI', removalOutcome: 'RETURNED' })
    const view = buildPersonPropertyView([removed], 'MDI')
    expect(view.inEstablishment).toEqual([])
    expect(view.dueToTransferIn).toEqual([])
  })

  it('treats an unknown current prison as "here" (never claims the prisoner has left)', () => {
    const held = container({ prisonId: 'MDI', prisonerCurrentPrisonId: null })
    const view = buildPersonPropertyView([held], 'MDI')
    expect(view.hasLeft).toBe(false)
    expect(view.inEstablishment[0]!.status.text).toBe('Stored')
  })

  // Property the sending prison has transferred out to us but that we have not logged yet: it is removed
  // (outcome TRANSFERRED) and still carries our prison as its destination, so it shows as In transit.
  it('shows property transferred out to this prison but not yet logged here as In transit', () => {
    const inTransit = container({
      id: 'in-transit',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: 'MDI',
    })

    const view = buildPersonPropertyView([inTransit], 'MDI')

    // never listed as held here - it has not arrived in storage yet
    expect(view.inEstablishment).toEqual([])
    expect(view.dueToTransferIn.map(r => r.container.id)).toEqual(['in-transit'])
    expect(view.dueToTransferIn[0]!.status).toEqual({ text: 'In transit', classes: 'govuk-tag--blue' })
  })

  it('drops a transferred container once this prison has logged its arrival (reconciled)', () => {
    // The API clears receivingPrisonId on reconcile; this prison's own record takes over.
    const reconciled = container({
      prisonId: 'LEI',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: null,
    })

    const view = buildPersonPropertyView([reconciled], 'MDI')

    expect(view.inEstablishment).toEqual([])
    expect(view.dueToTransferIn).toEqual([])
  })

  // Leeds sent it to Isle of Wight, but the person was redirected here. The address records where they were
  // expected to go; the box belongs where they actually are, and this is the only prison that can receive it.
  it('shows in-transit property addressed elsewhere when its owner is here', () => {
    const redirected = container({
      prisonId: 'LEI',
      prisonerCurrentPrisonId: 'MDI',
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: 'IWI',
    })

    const view = buildPersonPropertyView([redirected], 'MDI')

    expect(view.dueToTransferIn.map(row => row.status)).toEqual([{ text: 'In transit', classes: 'govuk-tag--blue' }])
  })

  it('does not show in-transit property when its owner is neither here nor coming here', () => {
    const elsewhere = container({
      prisonId: 'LEI',
      prisonerCurrentPrisonId: 'BXI',
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: 'IWI',
    })

    // Viewed from MDI: the person is at Belmarsh and the box is addressed to the Isle of Wight, so it is no
    // business of ours. (The section is hidden anyway once the person is not here - this guards the rule.)
    expect(buildPersonPropertyView([elsewhere], 'MDI').dueToTransferIn).toEqual([])
  })

  it('does not treat a reconciled transfer as in transit, wherever its owner is', () => {
    const reconciled = container({
      prisonId: 'LEI',
      prisonerCurrentPrisonId: 'MDI',
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: null,
    })

    expect(buildPersonPropertyView([reconciled], 'MDI').dueToTransferIn).toEqual([])
  })
})

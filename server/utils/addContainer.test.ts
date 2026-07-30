import {
  errorCodeOf,
  matchableContainers,
  parseOptionalDate,
  validateDetails,
  validatePreviousSealNumbers,
} from './addContainer'
import type { ParsedDetails } from './addContainer'
import { buildPersonPropertyView } from './personProperty'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'

describe('parseOptionalDate', () => {
  it('returns no iso when all parts are blank', () => {
    expect(parseOptionalDate('', '', '')).toEqual({})
    expect(parseOptionalDate(undefined, undefined, undefined)).toEqual({})
  })

  it('assembles a valid date into an ISO string', () => {
    expect(parseOptionalDate('7', '1', '2026')).toEqual({ iso: '2026-01-07' })
    expect(parseOptionalDate('17', '12', '2026')).toEqual({ iso: '2026-12-17' })
  })

  it('errors when only some parts are supplied', () => {
    expect(parseOptionalDate('7', '', '2026').error).toBeDefined()
    expect(parseOptionalDate('', '1', '').error).toBeDefined()
  })

  it('rejects an impossible date', () => {
    expect(parseOptionalDate('31', '2', '2026').error).toBeDefined()
    expect(parseOptionalDate('7', '13', '2026').error).toBeDefined()
  })

  it('rejects a non-4-digit year', () => {
    expect(parseOptionalDate('7', '1', '26').error).toBeDefined()
  })
})

describe('validateDetails', () => {
  it('accepts a valid minimal form', () => {
    const { values, errors } = validateDetails({ sealNumber: 'SN1', containerType: 'STANDARD' })
    expect(errors).toEqual({})
    expect(values).toEqual({
      sealNumber: 'SN1',
      previousSealNumber: undefined,
      containerType: 'STANDARD',
      proposedDisposalDate: undefined,
    })
  })

  it('trims values and carries the optional fields', () => {
    const { values } = validateDetails({
      sealNumber: '  SN2 ',
      previousSealNumber: ' OLD1 ',
      containerType: 'VALUABLES',
      'disposalDate-day': '1',
      'disposalDate-month': '6',
      'disposalDate-year': '2026',
    })
    expect(values).toEqual({
      sealNumber: 'SN2',
      previousSealNumber: 'OLD1',
      containerType: 'VALUABLES',
      proposedDisposalDate: '2026-06-01',
    })
  })

  it('requires a seal number', () => {
    const { values, errors } = validateDetails({ containerType: 'STANDARD' })
    expect(values).toBeUndefined()
    expect(errors.sealNumber).toBeDefined()
  })

  it('requires a valid container type', () => {
    expect(validateDetails({ sealNumber: 'SN1' }).errors.containerType).toBeDefined()
    expect(validateDetails({ sealNumber: 'SN1', containerType: 'NOPE' }).errors.containerType).toBeDefined()
  })

  it('reports an invalid disposal date', () => {
    const { errors } = validateDetails({
      sealNumber: 'SN1',
      containerType: 'STANDARD',
      'disposalDate-day': '31',
      'disposalDate-month': '2',
      'disposalDate-year': '2026',
    })
    expect(errors.disposalDate).toBeDefined()
  })
})

describe('previous seal numbers', () => {
  const held = (overrides: Partial<PrisonerPropertyContainer>): PrisonerPropertyContainer =>
    ({
      id: 'c1',
      prisonId: 'LEI',
      currentSealNumber: '124744',
      removalOutcome: null,
      ...overrides,
    }) as PrisonerPropertyContainer

  const details = (previousSealNumber?: string): ParsedDetails => ({
    sealNumber: 'NEW',
    previousSealNumber,
    containerType: 'STANDARD',
  })

  describe('matchableContainers', () => {
    it('keeps property still in storage at another establishment', () => {
      const elsewhere = held({ prisonId: 'LEI' })
      expect(matchableContainers([elsewhere], 'MDI')).toEqual([elsewhere])
    })

    // The reported bug: matching worked for "Due for transfer out" property but not for "In transit". An
    // in-transit container carries removalOutcome TRANSFERRED, so a "not removed" rule excluded exactly the
    // property most obviously on its way here - and staff could see it listed while being told it did not exist.
    it('keeps in-transit property, which the sending prison has already transferred out to here', () => {
      const inTransit = held({ prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: 'MDI' })
      expect(matchableContainers([inTransit], 'MDI')).toEqual([inTransit])
    })

    it('excludes a transfer heading somewhere else', () => {
      expect(
        matchableContainers(
          [held({ prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: 'IWI' })],
          'MDI',
        ),
      ).toEqual([])
    })

    it('excludes property already here - it is not arriving on transfer', () => {
      expect(matchableContainers([held({ prisonId: 'MDI' })], 'MDI')).toEqual([])
    })

    it.each(['RETURNED', 'DISPOSED', 'COMBINED'] as const)('excludes property that has left storage (%s)', outcome => {
      expect(matchableContainers([held({ removalOutcome: outcome })], 'MDI')).toEqual([])
    })

    // The guarantee that stops the two drifting again: if staff can see it under "Property due to be
    // transferred in", they can quote its seal.
    it('is exactly the property shown as due to be transferred in', () => {
      const containers = [
        held({ id: 'awaiting', prisonId: 'LEI' }),
        held({ id: 'in-transit', prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: 'MDI' }),
        held({ id: 'here', prisonId: 'MDI' }),
        held({ id: 'returned', prisonId: 'LEI', removalOutcome: 'RETURNED' }),
        held({ id: 'elsewhere-bound', prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: 'IWI' }),
      ].map(c => ({ ...c, prisonerCurrentPrisonId: 'MDI' }) as PrisonerPropertyContainer)

      const shown = buildPersonPropertyView(containers, 'MDI').dueToTransferIn.map(r => r.container.id)

      expect(matchableContainers(containers, 'MDI').map(c => c.id)).toEqual(shown)
      expect(shown).toEqual(['awaiting', 'in-transit'])
    })
  })

  describe('validatePreviousSealNumbers', () => {
    it('accepts a seal held elsewhere, ignoring case and surrounding whitespace', () => {
      const matchable = [held({ currentSealNumber: 'OldSeal' })]
      expect(validatePreviousSealNumbers([details(' oldseal ')], matchable)).toEqual([])
    })

    it('accepts a blank previous seal - it is optional', () => {
      expect(validatePreviousSealNumbers([details(undefined), details('  ')], [])).toEqual([])
    })

    it('rejects a seal that matches nothing, anchored to the field the user typed into', () => {
      const errors = validatePreviousSealNumbers([details('TYPO')], [held({})])
      expect(errors).toHaveLength(1)
      expect(errors[0]!.href).toBe('#containers-0-previousSealNumber')
      expect(errors[0]!.text).toContain('TYPO')
    })

    it('names which container is wrong when several are being added', () => {
      const errors = validatePreviousSealNumbers([details('124744'), details('TYPO')], [held({})])
      expect(errors).toHaveLength(1)
      expect(errors[0]!.text).toMatch(/^Container 2: /)
      expect(errors[0]!.href).toBe('#containers-1-previousSealNumber')
    })
  })

  describe('errorCodeOf', () => {
    it('reads the API error code from the response body', () => {
      expect(errorCodeOf({ data: { errorCode: 'PREVIOUS_SEAL_NUMBER_NOT_FOUND' } })).toBe(
        'PREVIOUS_SEAL_NUMBER_NOT_FOUND',
      )
    })

    it('is undefined when the error carries no code', () => {
      expect(errorCodeOf({ data: {} })).toBeUndefined()
      expect(errorCodeOf(new Error('boom'))).toBeUndefined()
      expect(errorCodeOf(undefined)).toBeUndefined()
    })
  })
})

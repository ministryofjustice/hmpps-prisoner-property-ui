import {
  errorCodeOf,
  matchableContainers,
  parseOptionalDate,
  resolvePreviousSealNumbers,
  validateContainers,
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

  it('accepts a seal number of up to 20 characters, counted after trimming (MAPB-1054)', () => {
    expect(validateDetails({ sealNumber: 'A'.repeat(20), containerType: 'STANDARD' }).errors).toEqual({})
    expect(validateDetails({ sealNumber: `  ${'A'.repeat(20)}  `, containerType: 'STANDARD' }).errors).toEqual({})
  })

  it('rejects a seal number longer than 20 characters, which NOMIS cannot hold (MAPB-1054)', () => {
    const { values, errors } = validateDetails({ sealNumber: 'A'.repeat(21), containerType: 'STANDARD' })
    expect(values).toBeUndefined()
    expect(errors.sealNumber).toEqual({ text: 'Seal number must be 20 characters or less', href: '#sealNumber' })
  })

  it('does not check the length of a seal number that cannot be changed (MAPB-1054)', () => {
    const { values, errors } = validateDetails(
      { sealNumber: 'A'.repeat(21), containerType: 'STANDARD' },
      { sealEditable: false },
    )
    expect(errors).toEqual({})
    expect(values?.sealNumber).toEqual('A'.repeat(21))
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

describe('validateContainers', () => {
  it('rejects repeated current seals, ignoring case and whitespace', () => {
    expect(
      validateContainers([
        { sealNumber: ' incoming1 ', containerType: 'STANDARD' },
        { sealNumber: 'INCOMING1', containerType: 'VALUABLES' },
      ]),
    ).toEqual({
      errors: [
        {
          text: 'Container 2: Enter a different seal number for each property container',
          href: '#containers-1-sealNumber',
        },
      ],
    })
  })

  it('accepts distinct current seals', () => {
    expect(
      validateContainers([
        { sealNumber: 'ONE', containerType: 'STANDARD' },
        { sealNumber: 'TWO', containerType: 'STANDARD' },
      ]).errors,
    ).toEqual([])
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
        held({ id: 'reconciled', prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: null }),
        // Addressed to the Isle of Wight, but its owner ended up here - so it is coming here after all.
        held({ id: 'redirected', prisonId: 'LEI', removalOutcome: 'TRANSFERRED', receivingPrisonId: 'IWI' }),
      ].map(c => ({ ...c, prisonerCurrentPrisonId: 'MDI' }) as PrisonerPropertyContainer)

      const shown = buildPersonPropertyView(containers, 'MDI').dueToTransferIn.map(r => r.container.id)

      expect(matchableContainers(containers, 'MDI').map(c => c.id)).toEqual(shown)
      expect(shown).toEqual(['awaiting', 'in-transit', 'redirected'])
    })
  })

  describe('resolvePreviousSealNumbers', () => {
    it('does not select the first container when an incoming seal is ambiguous', () => {
      expect(
        resolvePreviousSealNumbers(
          [details()],
          [held({ id: 'one', currentSealNumber: 'NEW' }), held({ id: 'two', currentSealNumber: 'new' })],
        ),
      ).toEqual([details()])
    })

    it('records the sending establishment without populating the entered previous seal', () => {
      expect(
        resolvePreviousSealNumbers([details()], [held({ currentSealNumber: 'NEW', prisonName: 'Leeds (HMP)' })]),
      ).toEqual([{ ...details(), automaticMatch: { sealNumber: 'NEW', prisonName: 'Leeds (HMP)' } }])
    })

    it('matches an unchanged current seal, ignoring case and whitespace, using the recorded seal', () => {
      expect(
        resolvePreviousSealNumbers(
          [{ ...details(), sealNumber: ' oldseal ' }],
          [held({ currentSealNumber: ' OldSeal ' })],
        ),
      ).toEqual([
        {
          ...details(),
          sealNumber: ' oldseal ',
          automaticMatch: { sealNumber: 'OldSeal', prisonName: 'LEI' },
        },
      ])
    })

    it('preserves an explicitly entered previous seal', () => {
      expect(resolvePreviousSealNumbers([details('OTHER')], [held({ currentSealNumber: 'NEW' })])).toEqual([
        details('OTHER'),
      ])
    })

    it('leaves unmatched and seal-less property unlinked in a mixed batch', () => {
      expect(
        resolvePreviousSealNumbers(
          [details(), { ...details(), sealNumber: '124744' }],
          [held({}), held({ id: 'no-seal', currentSealNumber: null })],
        ),
      ).toEqual([
        details(),
        {
          ...details(),
          sealNumber: '124744',
          automaticMatch: { sealNumber: '124744', prisonName: 'LEI' },
        },
      ])
    })
  })

  describe('validatePreviousSealNumbers', () => {
    it.each([undefined, '0000'])('rejects ambiguous incoming seals (previous seal %s)', previousSeal => {
      const incoming = [held({ id: 'one', currentSealNumber: '0000' }), held({ id: 'two', currentSealNumber: '0000' })]
      const resolved = resolvePreviousSealNumbers([{ ...details(previousSeal), sealNumber: '0000' }], incoming)
      expect(validatePreviousSealNumbers(resolved, incoming)).toEqual([
        {
          text: 'More than one incoming property container has seal number 0000. Check which container is being received with the sending establishments before continuing',
          href: `#containers-0-${previousSeal ? 'previousSealNumber' : 'sealNumber'}`,
        },
      ])
    })

    it('rejects two different current seals linked to the same explicit previous seal', () => {
      expect(
        validatePreviousSealNumbers([details('124744'), { ...details(' 124744 '), sealNumber: 'OTHER' }], [held({})]),
      ).toEqual([
        {
          text: 'Container 2: This property due in has already been matched to another container in this journey',
          href: '#containers-1-previousSealNumber',
        },
      ])
    })

    it('rejects an automatic match already used by an explicit previous seal', () => {
      const resolved = resolvePreviousSealNumbers(
        [details('oldseal'), { ...details(), sealNumber: 'OLDSEAL' }],
        [held({ currentSealNumber: 'OldSeal' })],
      )
      expect(validatePreviousSealNumbers(resolved, [held({ currentSealNumber: 'OldSeal' })])).toEqual([
        {
          text: 'Container 2: This property due in has already been matched to another container in this journey',
          href: '#containers-1-sealNumber',
        },
      ])
    })

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

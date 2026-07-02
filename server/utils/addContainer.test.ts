import { parseOptionalDate, validateDetails } from './addContainer'

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

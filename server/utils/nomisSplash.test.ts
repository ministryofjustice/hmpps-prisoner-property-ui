import { deriveNomisState, isNomisScreenState, nomisStateSuccessMessage, NomisScreenNotSetUpError } from './nomisSplash'

describe('nomisSplash', () => {
  describe('deriveNomisState', () => {
    const caseloadCondition = (conditionValue: string, blockAccess: boolean) => ({
      conditionType: 'CASELOAD',
      conditionValue,
      blockAccess,
    })

    it('is NORMAL when there is no matching caseload condition', () => {
      expect(deriveNomisState([], 'MDI')).toBe('NORMAL')
      expect(deriveNomisState([caseloadCondition('LEI', true)], 'MDI')).toBe('NORMAL')
    })

    it('is WARNING for a caseload condition that does not block access', () => {
      expect(deriveNomisState([caseloadCondition('MDI', false)], 'MDI')).toBe('WARNING')
    })

    it('is BLOCKED for a caseload condition that blocks access', () => {
      expect(deriveNomisState([caseloadCondition('MDI', true)], 'MDI')).toBe('BLOCKED')
    })

    it('ignores non-caseload conditions with the same value', () => {
      expect(deriveNomisState([{ conditionType: 'USER', conditionValue: 'MDI', blockAccess: true }], 'MDI')).toBe(
        'NORMAL',
      )
    })
  })

  describe('isNomisScreenState', () => {
    it('accepts only the three known states', () => {
      expect(isNomisScreenState('NORMAL')).toBe(true)
      expect(isNomisScreenState('WARNING')).toBe(true)
      expect(isNomisScreenState('BLOCKED')).toBe(true)
      expect(isNomisScreenState('OTHER')).toBe(false)
      expect(isNomisScreenState(undefined)).toBe(false)
    })
  })

  describe('nomisStateSuccessMessage', () => {
    it('describes each state change for the given prison', () => {
      expect(nomisStateSuccessMessage('Moorland', 'BLOCKED')).toContain('blocked for Moorland')
      expect(nomisStateSuccessMessage('Moorland', 'WARNING')).toContain('warning is now showing for Moorland')
      expect(nomisStateSuccessMessage('Moorland', 'NORMAL')).toContain('back to normal for Moorland')
    })
  })

  it('NomisScreenNotSetUpError carries its name', () => {
    expect(new NomisScreenNotSetUpError().name).toBe('NomisScreenNotSetUpError')
  })
})

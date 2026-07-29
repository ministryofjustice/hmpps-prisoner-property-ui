import { buildPrisonerBanner, fallbackPrisonerBanner } from './prisonerBanner'
import type { Prisoner } from '../data/prisonerSearchApiTypes'

const prisoner = (overrides: Partial<Prisoner> = {}): Prisoner => ({
  prisonerNumber: 'A1234BC',
  firstName: 'JOHN',
  lastName: 'SMITH',
  dateOfBirth: '2001-01-01',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  cellLocation: 'F-3-042',
  status: 'ACTIVE IN',
  ...overrides,
})

describe('buildPrisonerBanner', () => {
  it('builds the banner in "Lastname, Firstname" title case and marks the prisoner as in this establishment', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner(), 'MDI')

    expect(banner).toEqual(
      expect.objectContaining({
        prisonerNumber: 'A1234BC',
        name: 'Smith, John',
        dateOfBirth: '2001-01-01',
        establishment: 'Moorland (HMP & YOI)',
        cellLocation: 'F-3-042',
        status: 'ACTIVE IN',
        inThisEstablishment: true,
      }),
    )
    expect(banner.profileUrl).toContain('/prisoner/A1234BC')
  })

  it('marks the prisoner as not in this establishment when their prison differs from the viewed caseload', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner({ prisonId: 'LEI' }), 'MDI')

    expect(banner.inThisEstablishment).toBe(false)
  })

  it('is not in this establishment when the prisoner has no current prison', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner({ prisonId: null }), 'MDI')

    expect(banner.inThisEstablishment).toBe(false)
  })

  it('shows "Transferring" as the establishment while the prisoner is in transit', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner({ prisonId: 'TRN', prisonName: null }), 'MDI', 'IN_TRANSIT')

    expect(banner.establishment).toBe('Transferring')
  })

  it('shows "Released" as the establishment once the prisoner has been released', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner({ prisonId: 'OUT', prisonName: null }), 'MDI', 'RELEASED')

    expect(banner.establishment).toBe('Released')
  })

  it('shows the prison name when the prisoner is held in an establishment', () => {
    const banner = buildPrisonerBanner('A1234BC', prisoner(), 'MDI', 'IN_ESTABLISHMENT')

    expect(banner.establishment).toBe('Moorland (HMP & YOI)')
  })
})

describe('fallbackPrisonerBanner', () => {
  it('builds a minimal banner from the known name with no establishment-dependent fields', () => {
    const banner = fallbackPrisonerBanner('A1234BC', 'John Smith')

    expect(banner).toEqual(
      expect.objectContaining({
        prisonerNumber: 'A1234BC',
        name: 'John Smith',
        dateOfBirth: null,
        establishment: null,
        cellLocation: null,
        status: null,
        inThisEstablishment: false,
      }),
    )
  })

  it('falls back to "Unknown" when no name is known', () => {
    expect(fallbackPrisonerBanner('A1234BC', null).name).toBe('Unknown')
  })
})

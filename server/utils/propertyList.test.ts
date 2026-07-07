import type { ParsedQs } from 'qs'
import type { PrisonerPropertyContainer, PrisonerPropertyGroup } from '../data/prisonerPropertyApiTypes'
import {
  buildPagination,
  containerLocation,
  containerTypeLabel,
  establishmentLabel,
  isPrisonerNumber,
  parsePropertyListQuery,
  searchToFilters,
  statusTag,
} from './propertyList'

describe('propertyList utils', () => {
  describe('isPrisonerNumber', () => {
    it('accepts a valid prison number', () => {
      expect(isPrisonerNumber('A1234BC')).toBe(true)
      expect(isPrisonerNumber('a1234bc')).toBe(true)
    })

    it('rejects anything that is not a prison number', () => {
      expect(isPrisonerNumber('not-a-number')).toBe(false)
      expect(isPrisonerNumber('A1234B')).toBe(false)
      expect(isPrisonerNumber('SN0001')).toBe(false)
      expect(isPrisonerNumber('')).toBe(false)
    })
  })

  describe('statusTag', () => {
    it('maps known statuses to label + colour', () => {
      expect(statusTag('STORED')).toEqual({ text: 'Stored', classes: 'govuk-tag--blue' })
      expect(statusTag('DISPOSAL_REQUIRED')).toEqual({ text: 'Due for disposal', classes: 'govuk-tag--orange' })
      expect(statusTag('DUE_FOR_TRANSFER_OUT')).toEqual({ text: 'Due for transfer out', classes: 'govuk-tag--yellow' })
    })
  })

  describe('containerTypeLabel', () => {
    it('maps types to sentence-case labels', () => {
      expect(containerTypeLabel('STANDARD')).toBe('Standard')
      expect(containerTypeLabel('CONFISCATED')).toBe('Confiscated')
    })
  })

  describe('containerLocation', () => {
    it('shows Branston for offsite storage', () => {
      expect(
        containerLocation({ currentLocationType: 'BRANSTON', locationDescription: null } as PrisonerPropertyContainer),
      ).toBe('Branston (offsite)')
    })

    it('shows the location description for internal storage', () => {
      expect(
        containerLocation({
          currentLocationType: 'INTERNAL',
          locationDescription: 'Reception Store',
        } as PrisonerPropertyContainer),
      ).toBe('Reception Store')
    })

    it('falls back to a dash when there is no location', () => {
      expect(
        containerLocation({ currentLocationType: null, locationDescription: null } as PrisonerPropertyContainer),
      ).toBe('-')
    })
  })

  describe('establishmentLabel', () => {
    const group = (fields: Partial<PrisonerPropertyGroup>): PrisonerPropertyGroup =>
      ({ prisonerCurrentPrisonName: null, prisonerMovementStatus: null, ...fields }) as PrisonerPropertyGroup

    it('describes a prisoner in transit as Transferring', () => {
      expect(establishmentLabel(group({ prisonerMovementStatus: 'IN_TRANSIT' }))).toBe('Transferring')
    })

    it('describes a released prisoner as Released', () => {
      expect(establishmentLabel(group({ prisonerMovementStatus: 'RELEASED' }))).toBe('Released')
    })

    it('shows the current establishment name when the prisoner is in an establishment', () => {
      expect(
        establishmentLabel(
          group({ prisonerMovementStatus: 'IN_ESTABLISHMENT', prisonerCurrentPrisonName: 'Leeds (HMP)' }),
        ),
      ).toBe('Leeds (HMP)')
    })

    it('falls back to Not known when the establishment is unresolved', () => {
      expect(establishmentLabel(group({ prisonerCurrentPrisonName: null }))).toBe('Not known')
    })
  })

  describe('searchToFilters', () => {
    it('routes a full prison number to prisonerNumber (uppercased)', () => {
      expect(searchToFilters('a1234bc')).toEqual({ prisonerNumber: 'A1234BC' })
    })

    it('routes anything else to sealNumber', () => {
      expect(searchToFilters('SN8842K1')).toEqual({ sealNumber: 'SN8842K1' })
    })

    it('returns nothing for an empty search', () => {
      expect(searchToFilters('')).toEqual({})
    })
  })

  describe('parsePropertyListQuery', () => {
    it('parses filters, whitelists values and makes the API page zero-based', () => {
      const reqQuery = {
        q: 'A1234BC',
        containerType: 'VALUABLES',
        status: ['STORED', 'BOGUS'],
        storageLocation: 'PB5638',
        page: '3',
      } as unknown as ParsedQs

      const result = parsePropertyListQuery(reqQuery, 20)

      expect(result.search).toBe('A1234BC')
      expect(result.containerTypes).toEqual(['VALUABLES'])
      expect(result.statuses).toEqual(['STORED'])
      expect(result.page).toBe(3)
      expect(result.apiQuery).toEqual({
        prisonerNumber: 'A1234BC',
        containerType: 'VALUABLES',
        status: ['STORED'],
        storageLocation: 'PB5638',
        page: 2,
        size: 20,
      })
    })

    it('defaults page to 1 and drops invalid container types / empty status', () => {
      const result = parsePropertyListQuery({ containerType: 'NOPE', page: '0' } as unknown as ParsedQs, 20)

      expect(result.page).toBe(1)
      expect(result.containerTypes).toEqual([])
      expect(result.apiQuery.containerType).toBeUndefined()
      expect(result.apiQuery.status).toBeUndefined()
      expect(result.apiQuery.page).toBe(0)
    })

    it('accepts multiple container types but sends only the first to the API for now', () => {
      const result = parsePropertyListQuery({ containerType: ['STANDARD', 'VALUABLES'] } as unknown as ParsedQs, 20)

      expect(result.containerTypes).toEqual(['STANDARD', 'VALUABLES'])
      expect(result.apiQuery.containerType).toBe('STANDARD')
    })
  })

  describe('buildPagination', () => {
    it('builds results range, prev/next and item links', () => {
      const pagination = buildPagination(2, 3, 55, 20, 'q=A1234BC')

      expect(pagination.results).toEqual({ from: 21, to: 40, count: 55 })
      expect(pagination.previous?.href).toBe('?q=A1234BC&page=1')
      expect(pagination.next?.href).toBe('?q=A1234BC&page=3')
      expect(pagination.items.map(item => item.text)).toEqual([1, 2, 3])
      expect(pagination.items[1]?.selected).toBe(true)
    })

    it('omits previous on the first page and next on the last', () => {
      const single = buildPagination(1, 1, 5, 20, '')
      expect(single.previous).toBeUndefined()
      expect(single.next).toBeUndefined()
      expect(single.results).toEqual({ from: 1, to: 5, count: 5 })
    })

    it('reports a zero range when there are no results', () => {
      const empty = buildPagination(1, 0, 0, 20, '')
      expect(empty.results).toEqual({ from: 0, to: 0, count: 0 })
    })
  })
})

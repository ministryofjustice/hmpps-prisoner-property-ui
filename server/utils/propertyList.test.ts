import type { ParsedQs } from 'qs'
import type { PrisonerPropertyContainer, PrisonerPropertyGroup } from '../data/prisonerPropertyApiTypes'
import {
  buildPagination,
  containerLocation,
  containerTypeLabel,
  establishmentLabel,
  establishmentListStatusTag,
  isPrisonerNumber,
  parsePropertyListQuery,
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
      expect(statusTag('STORED')).toEqual({ text: 'Stored', classes: 'govuk-tag--green' })
      expect(statusTag('DISPOSAL_REQUIRED')).toEqual({ text: 'Due for disposal', classes: 'govuk-tag--orange' })
      expect(statusTag('DUE_FOR_TRANSFER_OUT')).toEqual({ text: 'Due for transfer out', classes: 'govuk-tag--yellow' })
      expect(statusTag('DUE_FOR_RETURN')).toEqual({ text: 'Due for return', classes: 'govuk-tag--yellow' })
    })
  })

  describe('establishmentListStatusTag', () => {
    it('tags property held at another prison as "Due for transfer in" relative to the viewed prison', () => {
      const incoming = { prisonId: 'LEI', currentStatus: 'DUE_FOR_TRANSFER_OUT' } as PrisonerPropertyContainer

      expect(establishmentListStatusTag(incoming, 'MDI')).toEqual({
        text: 'Due for transfer in',
        classes: 'govuk-tag--turquoise',
      })
    })

    it('uses the container status for property held at the viewed prison', () => {
      const heldHere = { prisonId: 'MDI', currentStatus: 'DUE_FOR_TRANSFER_OUT' } as PrisonerPropertyContainer

      expect(establishmentListStatusTag(heldHere, 'MDI')).toEqual({
        text: 'Due for transfer out',
        classes: 'govuk-tag--yellow',
      })
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

    it('shows Branston for excess property even without a BRANSTON location type', () => {
      expect(
        containerLocation({
          containerType: 'EXCESS',
          currentLocationType: null,
          locationDescription: null,
        } as PrisonerPropertyContainer),
      ).toBe('Branston (offsite)')
    })

    it('shows the internal location for excess property stored in a prison location', () => {
      expect(
        containerLocation({
          containerType: 'EXCESS',
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

  describe('parsePropertyListQuery', () => {
    it('parses filters, whitelists values and makes the API page zero-based', () => {
      const reqQuery = {
        q: 'A1234BC',
        containerType: ['STANDARD', 'VALUABLES'],
        status: ['STORED', 'BOGUS'],
        includeRemoved: 'true',
        page: '3',
      } as unknown as ParsedQs

      const result = parsePropertyListQuery(reqQuery, 20)

      expect(result.search).toBe('A1234BC')
      expect(result.containerTypes).toEqual(['STANDARD', 'VALUABLES'])
      expect(result.statuses).toEqual(['STORED'])
      expect(result.includeRemoved).toBe(true)
      expect(result.page).toBe(3)
      expect(result.apiQuery).toEqual({
        query: 'A1234BC',
        containerType: ['STANDARD', 'VALUABLES'],
        status: ['STORED'],
        includeRemoved: true,
        page: 2,
        size: 20,
      })
    })

    it('accepts the DUE_FOR_RETURN status filter and passes it to the API', () => {
      const result = parsePropertyListQuery({ status: 'DUE_FOR_RETURN' } as unknown as ParsedQs, 20)

      expect(result.statuses).toEqual(['DUE_FOR_RETURN'])
      expect(result.apiQuery.status).toEqual(['DUE_FOR_RETURN'])
    })

    it('pulls the "Due for transfer in" pseudo-status out into the dueForTransferIn flag', () => {
      const result = parsePropertyListQuery(
        { status: ['DUE_FOR_TRANSFER_IN', 'DUE_FOR_RETURN'] } as unknown as ParsedQs,
        20,
      )

      // It isn't a real status, so it never reaches the API's status list.
      expect(result.statuses).toEqual(['DUE_FOR_RETURN'])
      expect(result.dueForTransferIn).toBe(true)
      expect(result.apiQuery.status).toEqual(['DUE_FOR_RETURN'])
      expect(result.apiQuery.dueForTransferIn).toBe(true)
    })

    it('leaves dueForTransferIn unset when the box is not ticked', () => {
      const result = parsePropertyListQuery({ status: 'DUE_FOR_RETURN' } as unknown as ParsedQs, 20)

      expect(result.dueForTransferIn).toBe(false)
      expect(result.apiQuery.dueForTransferIn).toBeUndefined()
    })

    it('passes a single person-location filter to the API', () => {
      const result = parsePropertyListQuery({ personLocation: 'IN_ESTABLISHMENT' } as unknown as ParsedQs, 20)

      expect(result.personLocations).toEqual(['IN_ESTABLISHMENT'])
      expect(result.apiQuery.personLocation).toBe('IN_ESTABLISHMENT')
    })

    it('omits the person-location filter when both boxes are ticked (that means everyone)', () => {
      const result = parsePropertyListQuery(
        { personLocation: ['IN_ESTABLISHMENT', 'LEFT_ESTABLISHMENT'] } as unknown as ParsedQs,
        20,
      )

      expect(result.personLocations).toEqual(['IN_ESTABLISHMENT', 'LEFT_ESTABLISHMENT'])
      expect(result.apiQuery.personLocation).toBeUndefined()
    })

    it('drops an invalid person-location value', () => {
      const result = parsePropertyListQuery({ personLocation: 'NOWHERE' } as unknown as ParsedQs, 20)

      expect(result.personLocations).toEqual([])
      expect(result.apiQuery.personLocation).toBeUndefined()
    })

    it('defaults page to 1 and drops invalid container types / empty status / unticked includeRemoved', () => {
      const result = parsePropertyListQuery({ containerType: 'NOPE', page: '0' } as unknown as ParsedQs, 20)

      expect(result.page).toBe(1)
      expect(result.containerTypes).toEqual([])
      expect(result.includeRemoved).toBe(false)
      expect(result.apiQuery.query).toBeUndefined()
      expect(result.apiQuery.containerType).toBeUndefined()
      expect(result.apiQuery.status).toBeUndefined()
      expect(result.apiQuery.includeRemoved).toBeUndefined()
      expect(result.apiQuery.page).toBe(0)
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

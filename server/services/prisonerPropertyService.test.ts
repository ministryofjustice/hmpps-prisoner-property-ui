import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import PrisonerPropertyService from './prisonerPropertyService'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'

jest.mock('../data/prisonerPropertyApiClient')

describe('PrisonerPropertyService', () => {
  const prisonerPropertyApiClient = new PrisonerPropertyApiClient(
    {} as AuthenticationClient,
  ) as jest.Mocked<PrisonerPropertyApiClient>
  let prisonerPropertyService: PrisonerPropertyService

  beforeEach(() => {
    prisonerPropertyService = new PrisonerPropertyService(prisonerPropertyApiClient)
  })

  it('should call getPropertyForPrisoner on the api client and return its result', async () => {
    const containers = [{ id: 'abc', prisonerNumber: 'A1234BC' }] as PrisonerPropertyContainer[]
    prisonerPropertyApiClient.getPropertyForPrisoner.mockResolvedValue(containers)

    const result = await prisonerPropertyService.getPropertyForPrisoner('A1234BC', 'AUSER_GEN')

    expect(prisonerPropertyApiClient.getPropertyForPrisoner).toHaveBeenCalledWith('A1234BC', 'AUSER_GEN')
    expect(result).toEqual(containers)
  })

  it('should call getPrisonProperty on the api client and return its result', async () => {
    const pageResult = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 } as never
    prisonerPropertyApiClient.getPrisonProperty.mockResolvedValue(pageResult)

    const query = { page: 0, size: 20 }
    const result = await prisonerPropertyService.getPrisonProperty('MDI', query, 'AUSER_GEN')

    expect(prisonerPropertyApiClient.getPrisonProperty).toHaveBeenCalledWith('MDI', query, 'AUSER_GEN')
    expect(result).toEqual(pageResult)
  })

  it('should call getPrisonPropertySummary on the api client and return its result', async () => {
    const summary = {
      availableStorageSpaces: 150,
      storedOnSite: 3000,
      dueToTransferOut: 80,
      dueToBeReturned: 0,
      dueToBeDisposed: 40,
    }
    prisonerPropertyApiClient.getPrisonPropertySummary.mockResolvedValue(summary)

    const result = await prisonerPropertyService.getPrisonPropertySummary('MDI', 'AUSER_GEN')

    expect(prisonerPropertyApiClient.getPrisonPropertySummary).toHaveBeenCalledWith('MDI', 'AUSER_GEN')
    expect(result).toEqual(summary)
  })
  it('should delegate getPropertyLocations to the api client', async () => {
    const locations = [
      {
        id: 'loc-1',
        prisonId: 'MDI',
        code: 'PROP1',
        name: 'Reception Store',
        capacity: 10,
        containersHeld: 3,
        availableSpaces: 7,
      },
    ]
    prisonerPropertyApiClient.getPropertyLocations.mockResolvedValue(locations)

    const result = await prisonerPropertyService.getPropertyLocations('MDI', 'AUSER_GEN')

    expect(prisonerPropertyApiClient.getPropertyLocations).toHaveBeenCalledWith('MDI', 'AUSER_GEN')
    expect(result).toEqual(locations)
  })

  it('should delegate createPropertyLocation to the api client', async () => {
    const location = {
      id: 'loc-1',
      prisonId: 'MDI',
      code: 'PROP1',
      name: 'Reception Store',
      capacity: 10,
      containersHeld: 0,
      availableSpaces: 10,
    }
    prisonerPropertyApiClient.createPropertyLocation.mockResolvedValue(location)

    const result = await prisonerPropertyService.createPropertyLocation(
      'MDI',
      { localName: 'Reception Store', capacity: 10 },
      'AUSER_GEN',
    )

    expect(prisonerPropertyApiClient.createPropertyLocation).toHaveBeenCalledWith(
      'MDI',
      { localName: 'Reception Store', capacity: 10 },
      'AUSER_GEN',
    )
    expect(result).toEqual(location)
  })

  it('should delegate updatePropertyLocation to the api client', async () => {
    const location = {
      id: 'loc-1',
      prisonId: 'MDI',
      code: 'PROP1',
      name: 'Reception Store',
      capacity: 25,
      containersHeld: 0,
      availableSpaces: 25,
    }
    prisonerPropertyApiClient.updatePropertyLocation.mockResolvedValue(location)

    const result = await prisonerPropertyService.updatePropertyLocation('loc-1', { capacity: 25 }, 'AUSER_GEN')

    expect(prisonerPropertyApiClient.updatePropertyLocation).toHaveBeenCalledWith(
      'loc-1',
      { capacity: 25 },
      'AUSER_GEN',
    )
    expect(result).toEqual(location)
  })

  it('should delegate removePropertyLocation to the api client', async () => {
    const location = {
      id: 'loc-1',
      prisonId: 'MDI',
      code: 'PROP1',
      name: 'Reception Store',
      capacity: 10,
      containersHeld: 0,
      availableSpaces: 10,
    }
    prisonerPropertyApiClient.removePropertyLocation.mockResolvedValue(location)

    const result = await prisonerPropertyService.removePropertyLocation('loc-1', 'AUSER_GEN')

    expect(prisonerPropertyApiClient.removePropertyLocation).toHaveBeenCalledWith('loc-1', 'AUSER_GEN')
    expect(result).toEqual(location)
  })
})

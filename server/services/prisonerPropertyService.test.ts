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
})

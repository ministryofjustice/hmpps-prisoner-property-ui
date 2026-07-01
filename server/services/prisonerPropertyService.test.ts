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
})

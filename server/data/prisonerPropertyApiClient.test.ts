import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerPropertyApiClient from './prisonerPropertyApiClient'
import config from '../config'
import type { PrisonerPropertyContainer } from './prisonerPropertyApiTypes'

describe('PrisonerPropertyApiClient', () => {
  let prisonerPropertyApiClient: PrisonerPropertyApiClient
  let mockAuthenticationClient: jest.Mocked<AuthenticationClient>

  beforeEach(() => {
    mockAuthenticationClient = {
      getToken: jest.fn().mockResolvedValue('test-system-token'),
    } as unknown as jest.Mocked<AuthenticationClient>

    prisonerPropertyApiClient = new PrisonerPropertyApiClient(mockAuthenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
  })

  describe('getPropertyForPrisoner', () => {
    it('should GET the prisoner containers using a system token for the user and return the body', async () => {
      const containers = [{ id: '0196f1d3-9a1f-7c3a-9b2e-2c1f3a4b5c6d', prisonerNumber: 'A1234BC' }]

      nock(config.apis.prisonerPropertyApi.url)
        .get('/property-containers/prisoner/A1234BC')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, containers)

      const response = await prisonerPropertyApiClient.getPropertyForPrisoner('A1234BC', 'AUSER_GEN')

      expect(response).toEqual(containers as PrisonerPropertyContainer[])
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })
})

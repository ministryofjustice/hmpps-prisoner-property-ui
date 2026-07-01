import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import ManageUsersApiClient from './manageUsersApiClient'
import config from '../config'

describe('ManageUsersApiClient', () => {
  let manageUsersApiClient: ManageUsersApiClient
  let mockAuthenticationClient: jest.Mocked<AuthenticationClient>

  beforeEach(() => {
    mockAuthenticationClient = {
      getToken: jest.fn().mockResolvedValue('unused-system-token'),
    } as unknown as jest.Mocked<AuthenticationClient>

    manageUsersApiClient = new ManageUsersApiClient(mockAuthenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
  })

  describe('getUserCaseloads', () => {
    it('should GET the user caseloads using the user token (not a system token)', async () => {
      const caseloads = {
        username: 'USER1',
        active: true,
        activeCaseload: { id: 'MDI', name: 'Moorland (HMP & YOI)' },
        caseloads: [{ id: 'MDI', name: 'Moorland (HMP & YOI)' }],
      }

      nock(config.apis.manageUsersApi.url)
        .get('/users/me/caseloads')
        .matchHeader('authorization', 'Bearer user-jwt-token')
        .reply(200, caseloads)

      const response = await manageUsersApiClient.getUserCaseloads('user-jwt-token')

      expect(response).toEqual(caseloads)
      // asUser uses the supplied token directly, so it must not request a system token
      expect(mockAuthenticationClient.getToken).not.toHaveBeenCalled()
    })
  })
})

import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import ManageUsersApiClient from '../data/manageUsersApiClient'
import UserService from './userService'

jest.mock('../data/manageUsersApiClient')

describe('UserService', () => {
  const manageUsersApiClient = new ManageUsersApiClient({} as AuthenticationClient) as jest.Mocked<ManageUsersApiClient>
  let userService: UserService

  beforeEach(() => {
    userService = new UserService(manageUsersApiClient)
  })

  afterEach(() => jest.resetAllMocks())

  it('maps the active caseload and caseload ids', async () => {
    manageUsersApiClient.getUserCaseloads.mockResolvedValue({
      username: 'USER1',
      active: true,
      activeCaseload: { id: 'MDI', name: 'Moorland (HMP & YOI)' },
      caseloads: [
        { id: 'MDI', name: 'Moorland (HMP & YOI)' },
        { id: 'LEI', name: 'Leeds (HMP)' },
      ],
    })

    const result = await userService.getActiveCaseload('token')

    expect(manageUsersApiClient.getUserCaseloads).toHaveBeenCalledWith('token')
    expect(result).toEqual({
      activeCaseloadId: 'MDI',
      activeCaseloadName: 'Moorland (HMP & YOI)',
      caseloadIds: ['MDI', 'LEI'],
    })
  })

  it('returns nulls when the user has no active caseload', async () => {
    manageUsersApiClient.getUserCaseloads.mockResolvedValue({
      username: 'USER1',
      active: true,
      activeCaseload: null,
      caseloads: [],
    })

    const result = await userService.getActiveCaseload('token')

    expect(result).toEqual({ activeCaseloadId: null, activeCaseloadName: null, caseloadIds: [] })
  })
})

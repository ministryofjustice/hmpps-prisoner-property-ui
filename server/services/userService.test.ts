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

  describe('getUserDisplayNames', () => {
    const userDetails = (username: string, name: string) => ({ username, name })

    it('resolves and de-duplicates usernames, skipping the system sentinel', async () => {
      manageUsersApiClient.getUser.mockImplementation((username: string) =>
        Promise.resolve(userDetails(username, username === 'AUSER' ? 'John Doe' : 'Jane Roe')),
      )

      const result = await userService.getUserDisplayNames(
        ['AUSER', 'AUSER', 'BUSER', 'PRISONER_PROPERTY_API', ''],
        'CALLER',
      )

      expect(result).toEqual(
        new Map([
          ['AUSER', 'John Doe'],
          ['BUSER', 'Jane Roe'],
        ]),
      )
      // de-duplicated, system sentinel + empty skipped
      expect(manageUsersApiClient.getUser).toHaveBeenCalledTimes(2)
      expect(manageUsersApiClient.getUser).toHaveBeenCalledWith('AUSER', 'CALLER')
      expect(manageUsersApiClient.getUser).not.toHaveBeenCalledWith('PRISONER_PROPERTY_API', 'CALLER')
    })

    it('caches resolved names so a second lookup makes no HTTP call', async () => {
      manageUsersApiClient.getUser.mockResolvedValue(userDetails('AUSER', 'John Doe'))

      await userService.getUserDisplayNames(['AUSER'], 'CALLER')
      const result = await userService.getUserDisplayNames(['AUSER'], 'CALLER')

      expect(result).toEqual(new Map([['AUSER', 'John Doe']]))
      expect(manageUsersApiClient.getUser).toHaveBeenCalledTimes(1)
    })

    it('omits a username (falling back to the raw id) when the lookup fails', async () => {
      manageUsersApiClient.getUser.mockRejectedValue(new Error('404 Not Found'))

      const result = await userService.getUserDisplayNames(['AUSER'], 'CALLER')

      expect(result.size).toBe(0)
    })
  })
})

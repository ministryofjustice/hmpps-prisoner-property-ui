import type { Request, Response } from 'express'
import requireActivePrison from './requireActivePrison'
import UserService from '../services/userService'
import ActiveAgenciesService from '../services/activeAgenciesService'

jest.mock('../services/userService')
jest.mock('../services/activeAgenciesService')

describe('requireActivePrison', () => {
  const userService = new UserService(null as never) as jest.Mocked<UserService>
  const activeAgenciesService = new ActiveAgenciesService(null as never) as jest.Mocked<ActiveAgenciesService>
  const next = jest.fn()

  const res = () =>
    ({
      locals: { user: { token: 'token' } },
      status: jest.fn(),
      render: jest.fn(),
    }) as unknown as Response

  const withCaseload = (activeCaseloadId: string | null) =>
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId,
      activeCaseloadName: activeCaseloadId,
      caseloadIds: activeCaseloadId ? [activeCaseloadId] : [],
    })

  afterEach(() => jest.resetAllMocks())

  it('calls next when the caseload prison is active in DPS', async () => {
    withCaseload('MDI')
    activeAgenciesService.isPrisonActive.mockResolvedValue(true)
    const response = res()

    await requireActivePrison(userService, activeAgenciesService)({} as Request, response, next)

    expect(activeAgenciesService.isPrisonActive).toHaveBeenCalledWith('MDI')
    expect(next).toHaveBeenCalled()
    expect(response.render).not.toHaveBeenCalled()
  })

  it('renders the authorisation error with a 403 when the prison is not active', async () => {
    withCaseload('MDI')
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)
    const response = res()

    await requireActivePrison(userService, activeAgenciesService)({} as Request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.render).toHaveBeenCalledWith('autherror')
  })

  it('renders the authorisation error when the user has no active caseload', async () => {
    withCaseload(null)
    const response = res()

    await requireActivePrison(userService, activeAgenciesService)({} as Request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(activeAgenciesService.isPrisonActive).not.toHaveBeenCalled()
    expect(response.render).toHaveBeenCalledWith('autherror')
  })
})

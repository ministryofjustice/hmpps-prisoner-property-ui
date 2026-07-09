import type { Request, Response } from 'express'
import requireAdminRole, { ADMIN_ROLE, canAdminister } from './requireAdminRole'

describe('canAdminister', () => {
  it('is true only when the user holds the admin role', () => {
    expect(canAdminister([ADMIN_ROLE])).toBe(true)
    expect(canAdminister(['PRISONERPROP__MANAGE'])).toBe(false)
    expect(canAdminister([])).toBe(false)
    expect(canAdminister(undefined)).toBe(false)
  })
})

describe('requireAdminRole', () => {
  const next = jest.fn()
  const res = () =>
    ({
      locals: { user: { userRoles: [] as string[] } },
      status: jest.fn(),
      render: jest.fn(),
    }) as unknown as Response

  afterEach(() => jest.resetAllMocks())

  it('calls next when the user has the admin role', () => {
    const response = res()
    response.locals.user.userRoles = [ADMIN_ROLE]

    requireAdminRole({} as Request, response, next)

    expect(next).toHaveBeenCalled()
    expect(response.render).not.toHaveBeenCalled()
  })

  it('renders the authorisation error with a 403 when the user lacks the role', () => {
    const response = res()

    requireAdminRole({} as Request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.render).toHaveBeenCalledWith('autherror')
  })
})

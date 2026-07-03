import type { RequestHandler } from 'express'

// The user role that lets a user manage (add/change/remove) property. Note the double underscore,
// preserved from the ROLE_PRISONERPROP__MANAGE authority by setUpCurrentUser.
export const MANAGE_ROLE = 'PRISONERPROP__MANAGE'

export const canManageProperty = (userRoles: string[] = []): boolean => userRoles.includes(MANAGE_ROLE)

/**
 * Gate a route on the signed-in user holding the manage role. Renders the authorisation-error page
 * (rather than signing the user out) so a user who reaches a write screen without the role is told
 * they cannot, not logged out. The write screens are also hidden from users without the role.
 */
const requireManageRole: RequestHandler = (_req, res, next) => {
  if (canManageProperty(res.locals.user?.userRoles)) {
    return next()
  }
  res.status(403)
  return res.render('autherror')
}

export default requireManageRole

import type { RequestHandler } from 'express'

// The user role that lets a user administer the property-service rollout (switch prisons on/off).
// Note the double underscore, preserved from the ROLE_PRISONERPROP__ADMIN authority by setUpCurrentUser.
export const ADMIN_ROLE = 'PRISONERPROP__ADMIN'

export const canAdminister = (userRoles: string[] = []): boolean => userRoles.includes(ADMIN_ROLE)

/**
 * Gate a route on the signed-in user holding the admin role. Renders the authorisation-error page
 * (rather than signing the user out) so a user who reaches the admin console without the role is told
 * they cannot. The admin console is also hidden from users without the role.
 */
const requireAdminRole: RequestHandler = (_req, res, next) => {
  if (canAdminister(res.locals.user?.userRoles)) {
    return next()
  }
  res.status(403)
  return res.render('autherror')
}

export default requireAdminRole

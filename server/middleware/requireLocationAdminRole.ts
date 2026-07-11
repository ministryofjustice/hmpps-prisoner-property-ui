import type { RequestHandler } from 'express'

// The user role that lets a user manage a prison's property storage locations (add/edit/remove).
// Note the double underscore, preserved from the ROLE_PRISONERPROP__LOCATION_ADMIN authority by
// setUpCurrentUser. Separate from the rollout-admin role (PRISONERPROP__ADMIN).
export const LOCATION_ADMIN_ROLE = 'PRISONERPROP__LOCATION_ADMIN'

export const canManageLocations = (userRoles: string[] = []): boolean => userRoles.includes(LOCATION_ADMIN_ROLE)

/**
 * Gate a route on the signed-in user holding the property-location admin role. Renders the
 * authorisation-error page (rather than signing the user out) so a user who reaches the screens
 * without the role is told they cannot. The links to these screens are also hidden without the role.
 */
const requireLocationAdminRole: RequestHandler = (_req, res, next) => {
  if (canManageLocations(res.locals.user?.userRoles)) {
    return next()
  }
  res.status(403)
  return res.render('autherror')
}

export default requireLocationAdminRole

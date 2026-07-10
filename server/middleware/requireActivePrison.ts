import type { RequestHandler } from 'express'
import type UserService from '../services/userService'
import type ActiveAgenciesService from '../services/activeAgenciesService'

/**
 * Gate a write route on the signed-in user's active-caseload prison being switched on in DPS. This is
 * the mutual-exclusivity guarantee for rollout: while an establishment is still managed in NOMIS its
 * property must be read-only in DPS, even for a user who holds the manage role. Renders the
 * authorisation-error page (rather than signing the user out) — the write screens are also hidden from
 * these users, so this is the server-side backstop against a directly-hit write URL.
 *
 * A factory because it needs the services; build it once in `routes()` and apply it alongside
 * `requireManageRole` on every write route.
 */
export default function requireActivePrison(
  userService: UserService,
  activeAgenciesService: ActiveAgenciesService,
): RequestHandler {
  return async (_req, res, next) => {
    const { activeCaseloadId } = await userService.getActiveCaseload(res.locals.user.token)
    if (activeCaseloadId && (await activeAgenciesService.isPrisonActive(activeCaseloadId))) {
      return next()
    }
    res.status(403)
    return res.render('autherror')
  }
}

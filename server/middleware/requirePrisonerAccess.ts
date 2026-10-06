import type { NextFunction, Request, RequestHandler, Response } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import { isPrisonerNumber } from '../utils/propertyList'
import {
  canAddPropertyHere,
  decidePrisonerAccess,
  type PrisonerAccessLevel,
  scopeContainers,
} from '../utils/prisonerAccess'
import logger from '../../logger'

/**
 * What a guarded prisoner route needs, resolved once by the guard so the route does not fetch it again.
 * `containers` is already limited to what the user may see.
 */
export interface PrisonerAccessContext {
  level: PrisonerAccessLevel
  prisonerNumber: string
  activeCaseloadId: string
  activeCaseloadName: string | null
  containers: PrisonerPropertyContainer[]
  // Prisoner-search details for the banner, or null when the lookup failed.
  prisoner: Prisoner | null
}

type Check = (input: {
  prisonerPrisonId: string | null
  caseloadIds: string[]
  activeCaseloadId: string
  userRoles: string[]
  containers: PrisonerPropertyContainer[]
}) => PrisonerAccessLevel | null

/**
 * Shared body of the guards: require an active caseload and a valid prison number, load the prisoner's
 * property and prisoner-search details, and apply `check`. A refusal is a plain "Prisoner not found", so the
 * page never confirms that someone the user may not see exists.
 *
 * The property API and prisoner search are called with a system token, so neither restricts what comes back:
 * this is the only place the access rules are applied.
 */
const guard =
  ({ userService, prisonerPropertyService, prisonerService }: Services, check: Check): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { token, username, userRoles = [] } = res.locals.user
    const prisonerNumber = String(req.params.prisonerNumber)

    const { activeCaseloadId, activeCaseloadName, caseloadIds } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // Prisoner-search feeds the banner and is the authoritative current prison, but a failure there should not
    // lock staff out of property at their own prison, so fall back to the prison the property records carry.
    const [containers, prisoner] = await Promise.all([
      prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username),
      prisonerService.getPrisonerDetails(prisonerNumber, username).catch((error: Error): Prisoner | null => {
        logger.warn(`Failed to load prisoner-search details for ${prisonerNumber}: ${error.message}`)
        return null
      }),
    ])
    const prisonerPrisonId =
      prisoner?.prisonId ?? containers.find(container => container.prisonerCurrentPrisonId)?.prisonerCurrentPrisonId

    const level = check({
      prisonerPrisonId: prisonerPrisonId ?? null,
      caseloadIds,
      activeCaseloadId,
      userRoles,
      containers,
    })
    if (!level) {
      logger.info(`Refused ${username} access to property for ${prisonerNumber} from ${activeCaseloadId}`)
      return next(createError(404, 'Prisoner not found'))
    }

    res.locals.prisonerAccess = {
      level,
      prisonerNumber,
      activeCaseloadId,
      activeCaseloadName,
      containers: scopeContainers(containers, level, activeCaseloadId),
      prisoner,
    }
    return next()
  }

/**
 * Guard a prisoner's property pages (and photo) on the access rules in `decidePrisonerAccess`. Build it once
 * in the router and apply it to every `/prisoner/:prisonerNumber` read route.
 */
export const requirePrisonerAccess = (services: Services): RequestHandler => guard(services, decidePrisonerAccess)

/**
 * Guard the add-property journey: the prisoner must be held at the user's prison now, or already have property
 * there. Grants a FULL context because the journey only ever writes to the user's own prison.
 */
export const requirePrisonerAtThisPrison = (services: Services): RequestHandler =>
  guard(services, ({ prisonerPrisonId, activeCaseloadId, containers }) =>
    canAddPropertyHere(prisonerPrisonId, activeCaseloadId, containers) ? 'FULL' : null,
  )

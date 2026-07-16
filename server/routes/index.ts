import { Router } from 'express'

import type { Services } from '../services'
import requireActivePrison from '../middleware/requireActivePrison'
import establishmentListRoutes from './establishmentList'
import prisonerPropertyRoutes from './prisonerProperty'
import addContainerRoutes from './journeys/addContainer'
import changeContainerRoutes from './journeys/changeContainer'
import removeContainerRoutes from './journeys/removeContainer'
import combineContainerRoutes from './journeys/combineContainer'
import adminPrisonsRoutes from './admin/prisons'
import adminLocationsRoutes from './admin/locations'

export default function routes(services: Services): Router {
  const router = Router()

  // Write journeys are additionally gated on the user's establishment being switched on in DPS, so a
  // prison still managed in NOMIS stays read-only here even for a user with the manage role. Built once
  // and shared across the four write journeys.
  const requireActivePrisonMw = requireActivePrison(services.userService, services.activeAgenciesService)

  router.use(establishmentListRoutes(services))
  router.use(prisonerPropertyRoutes(services))
  router.use(addContainerRoutes(services, requireActivePrisonMw))
  router.use(changeContainerRoutes(services, requireActivePrisonMw))
  router.use(removeContainerRoutes(services, requireActivePrisonMw))
  router.use(combineContainerRoutes(services, requireActivePrisonMw))
  router.use(adminPrisonsRoutes(services))
  router.use(adminLocationsRoutes(services))

  return router
}

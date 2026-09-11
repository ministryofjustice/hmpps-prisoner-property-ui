import { AuthenticationClient, InMemoryTokenStore, RedisTokenStore } from '@ministryofjustice/hmpps-auth-clients'
import { createRedisClient } from './redisClient'
import config from '../config'
import logger from '../../logger'
import PrisonerPropertyApiClient from './prisonerPropertyApiClient'
import PrisonerSearchApiClient from './prisonerSearchApiClient'
import PrisonApiClient from './prisonApiClient'
import ManageUsersApiClient from './manageUsersApiClient'
import applicationInfoSupplier from '../applicationInfo'

const applicationInfo = applicationInfoSupplier()

export const dataAccess = () => {
  const hmppsAuthClient = new AuthenticationClient(
    config.apis.hmppsAuth,
    logger,
    config.redis.enabled ? new RedisTokenStore(createRedisClient()) : new InMemoryTokenStore(),
  )

  return {
    applicationInfo,
    hmppsAuthClient,
    prisonerPropertyApiClient: new PrisonerPropertyApiClient(hmppsAuthClient),
    prisonerSearchApiClient: new PrisonerSearchApiClient(hmppsAuthClient),
    prisonApiClient: new PrisonApiClient(hmppsAuthClient),
    manageUsersApiClient: new ManageUsersApiClient(hmppsAuthClient),
  }
}

export type DataAccess = ReturnType<typeof dataAccess>

export {
  AuthenticationClient,
  PrisonerPropertyApiClient,
  PrisonerSearchApiClient,
  PrisonApiClient,
  ManageUsersApiClient,
}

import { RestClient, asUser } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { UserCaseloads } from './manageUsersApiTypes'

export default class ManageUsersApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('Manage Users API', config.apis.manageUsersApi, logger, authenticationClient)
  }

  /**
   * Get the signed-in user's caseloads and their active caseload.
   *
   * Called with the user's own token (`asUser`) since it returns the caller's record - no service
   * client role is required.
   */
  getUserCaseloads(userToken: string): Promise<UserCaseloads> {
    return this.get<UserCaseloads>({ path: '/users/me/caseloads' }, asUser(userToken))
  }
}

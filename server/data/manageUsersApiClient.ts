import { RestClient, asUser, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { UserCaseloads, UserDetails } from './manageUsersApiTypes'

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

  /**
   * Look up another user's details by username (to show a friendly acting-staff name on the property
   * history). The target user is not the caller, so this uses a system token tied to the signed-in user
   * (`asSystem(callerUsername)`), the same pattern the prisoner banner uses for downstream lookups.
   */
  getUser(username: string, callerUsername: string): Promise<UserDetails> {
    return this.get<UserDetails>({ path: `/users/${encodeURIComponent(username)}` }, asSystem(callerUsername))
  }
}

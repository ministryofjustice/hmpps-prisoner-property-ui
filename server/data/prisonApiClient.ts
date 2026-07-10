import { Readable } from 'stream'
import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { SplashScreen } from './prisonApiTypes'

export default class PrisonApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('Prison API', config.apis.prisonApi, logger, authenticationClient)
  }

  /**
   * Stream a prisoner's facial image. The offenderNo path segment is the prisoner number, so no
   * booking lookup is needed. Rejects if the prisoner has no image; callers fall back to a placeholder.
   *
   * Called with a system token tied to the signed-in user (`asSystem(username)`). The system client
   * must hold a role granting access to prisoner images.
   */
  getPrisonerImage(prisonerNumber: string, username: string): Promise<Readable> {
    return this.stream({ path: `/api/bookings/offenderNo/${prisonerNumber}/image/data` }, asSystem(username))
  }

  /**
   * Get a NOMIS splash screen (and its caseload conditions) for a module, e.g. OIDMPCON (property
   * management). Rejects with a 404 when the screen has not been set up. Called with a system token
   * tied to the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISON_API__SPLASH_SCREEN__RO role.
   */
  getSplashScreen(moduleName: string, username: string): Promise<SplashScreen> {
    return this.get<SplashScreen>({ path: `/api/splash-screen/${moduleName}` }, asSystem(username))
  }

  /**
   * Add a condition to a splash screen (e.g. block or warn a caseload). Called with a system token
   * tied to the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISON_API__SPLASH_SCREEN__RW role.
   */
  addSplashCondition(
    moduleName: string,
    conditionType: string,
    conditionValue: string,
    blockAccess: boolean,
    username: string,
  ): Promise<SplashScreen> {
    return this.post<SplashScreen>(
      { path: `/api/splash-screen/${moduleName}/condition`, data: { conditionType, conditionValue, blockAccess } },
      asSystem(username),
    )
  }

  /**
   * Update an existing splash-screen condition's block-access flag. Called with a system token tied to
   * the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISON_API__SPLASH_SCREEN__RW role.
   */
  updateSplashCondition(
    moduleName: string,
    conditionType: string,
    conditionValue: string,
    blockAccess: boolean,
    username: string,
  ): Promise<SplashScreen> {
    return this.put<SplashScreen>(
      { path: `/api/splash-screen/${moduleName}/condition/${conditionType}/${conditionValue}/${blockAccess}` },
      asSystem(username),
    )
  }

  /**
   * Remove a splash-screen condition (returning a caseload to normal access). Called with a system
   * token tied to the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISON_API__SPLASH_SCREEN__RW role.
   */
  removeSplashCondition(
    moduleName: string,
    conditionType: string,
    conditionValue: string,
    username: string,
  ): Promise<void> {
    return this.delete<void>(
      { path: `/api/splash-screen/${moduleName}/condition/${conditionType}/${conditionValue}` },
      asSystem(username),
    )
  }
}

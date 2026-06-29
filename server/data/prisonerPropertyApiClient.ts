import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { PrisonerPropertyContainer } from './prisonerPropertyApiTypes'

export default class PrisonerPropertyApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('Prisoner Property API', config.apis.prisonerPropertyApi, logger, authenticationClient)
  }

  /**
   * Get the property containers held for a prisoner.
   *
   * Calls the API with a system token tied to the signed-in user (`asSystem(username)`) so the
   * username is carried in the JWT for downstream auditing. The system client must hold the
   * ROLE_PRISONER_PROPERTY__RO role.
   */
  getPropertyForPrisoner(prisonerNumber: string, username: string): Promise<PrisonerPropertyContainer[]> {
    return this.get<PrisonerPropertyContainer[]>(
      { path: `/property-containers/prisoner/${prisonerNumber}` },
      asSystem(username),
    )
  }
}

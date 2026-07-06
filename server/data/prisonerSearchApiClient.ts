import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { Prisoner } from './prisonerSearchApiTypes'

export default class PrisonerSearchApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('Prisoner Search API', config.apis.prisonerSearchApi, logger, authenticationClient)
  }

  /**
   * Get a prisoner's details for the property banner (name, DOB, establishment, cell, status).
   *
   * Called with a system token tied to the signed-in user (`asSystem(username)`) so the username is
   * carried in the JWT for downstream auditing. The system client must hold a prisoner-search read role.
   */
  getPrisoner(prisonerNumber: string, username: string): Promise<Prisoner> {
    return this.get<Prisoner>({ path: `/prisoner/${prisonerNumber}` }, asSystem(username))
  }
}

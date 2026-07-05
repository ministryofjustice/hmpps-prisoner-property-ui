import { Readable } from 'stream'
import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'

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
}

import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type { RestPage } from './prisonerPropertyApiTypes'
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

  /**
   * Keyword-search prisoners by name or prison number, scoped to a single prison (never global). Results
   * are relevance-ranked (closest match first) and paged. Called with a system token tied to the signed-in
   * user (`asSystem(username)`).
   */
  searchPrisoners(
    term: string,
    prisonId: string,
    page: number,
    size: number,
    username: string,
  ): Promise<RestPage<Prisoner>> {
    // The /keyword endpoint takes the term in `andWords` (every word must match, so results narrow to the
    // closest match) and reads pagination from the body, not query params.
    return this.post<RestPage<Prisoner>>(
      {
        path: `/keyword`,
        data: { andWords: term, fuzzyMatch: true, prisonIds: [prisonId], pagination: { page, size } },
      },
      asSystem(username),
    )
  }
}

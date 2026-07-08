import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type {
  BoxLocation,
  CreateContainerRequest,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonerTimelineItem,
  PrisonPropertyListQuery,
  PrisonPropertySummary,
  PropertyEvent,
  RemoveContainerRequest,
  RestPage,
} from './prisonerPropertyApiTypes'

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

  /**
   * Get a container's event history (newest first).
   *
   * Called with a system token tied to the signed-in user (`asSystem(username)`). The system client
   * must hold the ROLE_PRISONER_PROPERTY__RO role.
   */
  getContainerEvents(id: string, username: string): Promise<PropertyEvent[]> {
    return this.get<PropertyEvent[]>({ path: `/property-containers/${id}/events` }, asSystem(username))
  }

  /**
   * Get a prisoner's whole-property history timeline (every event across all their containers,
   * interleaved newest first, plus prisoner-movement items).
   *
   * Called with a system token tied to the signed-in user (`asSystem(username)`). The system client
   * must hold the ROLE_PRISONER_PROPERTY__RO role.
   */
  getPrisonerPropertyHistory(prisonerNumber: string, username: string): Promise<PrisonerTimelineItem[]> {
    return this.get<PrisonerTimelineItem[]>(
      { path: `/property-containers/prisoner/${prisonerNumber}/events` },
      asSystem(username),
    )
  }

  /**
   * Get the establishment-wide property list for a prison, paged and grouped by prisoner.
   *
   * Called with a system token tied to the signed-in user (`asSystem(username)`). Filters are
   * exact-match on the API side; undefined query values are dropped by superagent.
   */
  getPrisonProperty(
    prisonId: string,
    query: PrisonPropertyListQuery,
    username: string,
  ): Promise<RestPage<PrisonerPropertyGroup>> {
    return this.get<RestPage<PrisonerPropertyGroup>>(
      { path: `/property-containers/prison/${prisonId}`, query: { ...query } },
      asSystem(username),
    )
  }

  /**
   * Get a page of a prison's box locations (with container counts), optionally filtered by a search
   * query. Called with a system token tied to the signed-in user (`asSystem(username)`); the system
   * client must hold the ROLE_PRISONER_PROPERTY__RO role.
   */
  getBoxLocations(
    prisonId: string,
    query: { query?: string; page?: number; size?: number },
    username: string,
  ): Promise<RestPage<BoxLocation>> {
    return this.get<RestPage<BoxLocation>>(
      { path: `/property-containers/prison/${prisonId}/box-locations`, query: { ...query } },
      asSystem(username),
    )
  }

  /**
   * Get the whole-prison property summary counts for a prison (for the establishment summary tiles).
   * Called with a system token tied to the signed-in user (`asSystem(username)`); the system client
   * must hold the ROLE_PRISONER_PROPERTY__RO role.
   */
  getPrisonPropertySummary(prisonId: string, username: string): Promise<PrisonPropertySummary> {
    return this.get<PrisonPropertySummary>(
      { path: `/property-containers/prison/${prisonId}/summary` },
      asSystem(username),
    )
  }

  /**
   * Create a new property container for a prisoner. Called with a system token tied to the signed-in
   * user (`asSystem(username)`); the system client must hold the ROLE_PRISONER_PROPERTY__RW role.
   */
  createContainer(body: CreateContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.post<PrisonerPropertyContainer>({ path: `/property-containers`, data: { ...body } }, asSystem(username))
  }

  /**
   * Remove a container from active storage (returned / disposed / created in error), or transfer it to
   * the prisoner's new establishment (which reassigns it there). Called with a system token tied to the
   * signed-in user (`asSystem(username)`); the system client must hold the ROLE_PRISONER_PROPERTY__RW role.
   */
  removeContainer(id: string, body: RemoveContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.post<PrisonerPropertyContainer>(
      { path: `/property-containers/${id}/remove`, data: { ...body } },
      asSystem(username),
    )
  }
}

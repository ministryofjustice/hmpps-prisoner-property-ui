import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import config from '../config'
import logger from '../../logger'
import type {
  AgencyStatus,
  BoxLocation,
  CombineContainersRequest,
  CreateContainerRequest,
  CreatePropertyLocationRequest,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonerTimelineItem,
  PrisonPropertyListQuery,
  PrisonPropertySummary,
  PropertyEvent,
  PropertyLocationAdmin,
  RemoveContainerRequest,
  RestPage,
  UpdateContainerRequest,
  UpdatePropertyLocationRequest,
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

  /**
   * Combine two or more of a prisoner's containers into a new sealed container. Called with a system
   * token tied to the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISONER_PROPERTY__RW role.
   */
  combineContainers(body: CombineContainersRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.post<PrisonerPropertyContainer>(
      { path: `/property-containers/combine`, data: { ...body } },
      asSystem(username),
    )
  }

  /**
   * Change a container's editable details (type, seal, disposal date, storage location). Called with a
   * system token tied to the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISONER_PROPERTY__RW role.
   */
  updateContainer(id: string, body: UpdateContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.put<PrisonerPropertyContainer>(
      { path: `/property-containers/${id}`, data: { ...body } },
      asSystem(username),
    )
  }

  /**
   * Get the agency ids for which the property service is switched on in DPS, from the public `/info`
   * endpoint's `activeAgencies` array. Called **unauthenticated** (no token) — `/info` is public and
   * this is on the ordinary read path, so we avoid needing a privileged token here. Returns `[]` when
   * the key is absent (e.g. an older API deploy) so callers degrade to "no prison active" safely.
   */
  async getActiveAgencyIds(): Promise<string[]> {
    const info = await this.get<{ activeAgencies?: string[] }>({ path: `/info` })
    return info?.activeAgencies ?? []
  }

  /**
   * List every prison with whether the property service is switched on, for the rollout admin console.
   * Called with a system token tied to the signed-in user (`asSystem(username)`); the system client
   * must hold the ROLE_PRISONER_PROPERTY__ADMIN role.
   */
  getAllAgencies(username: string): Promise<AgencyStatus[]> {
    return this.get<AgencyStatus[]>({ path: `/active-agencies/all` }, asSystem(username))
  }

  /**
   * Switch the property service on or off for a prison. Idempotent. Called with a system token tied to
   * the signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISONER_PROPERTY__ADMIN role.
   */
  setAgencyActive(agencyId: string, active: boolean, username: string): Promise<AgencyStatus> {
    return this.put<AgencyStatus>({ path: `/active-agencies/${agencyId}`, data: { active } }, asSystem(username))
  }

  /**
   * List the property storage locations for a prison (including full ones), each with its capacity and
   * how many containers it holds, for the management screens. Called with a system token tied to the
   * signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISONER_PROPERTY__LOCATION_ADMIN role.
   */
  getPropertyLocations(prisonId: string, username: string): Promise<PropertyLocationAdmin[]> {
    return this.get<PropertyLocationAdmin[]>({ path: `/property-locations/prison/${prisonId}` }, asSystem(username))
  }

  /**
   * Add a property storage location to a prison. Called with a system token tied to the signed-in user
   * (`asSystem(username)`); the system client must hold the ROLE_PRISONER_PROPERTY__LOCATION_ADMIN role.
   */
  createPropertyLocation(
    prisonId: string,
    body: CreatePropertyLocationRequest,
    username: string,
  ): Promise<PropertyLocationAdmin> {
    return this.post<PropertyLocationAdmin>(
      { path: `/property-locations/prison/${prisonId}`, data: { ...body } },
      asSystem(username),
    )
  }

  /**
   * Update a property storage location's name and/or capacity. Called with a system token tied to the
   * signed-in user (`asSystem(username)`); the system client must hold the
   * ROLE_PRISONER_PROPERTY__LOCATION_ADMIN role.
   */
  updatePropertyLocation(
    id: string,
    body: UpdatePropertyLocationRequest,
    username: string,
  ): Promise<PropertyLocationAdmin> {
    return this.put<PropertyLocationAdmin>({ path: `/property-locations/${id}`, data: { ...body } }, asSystem(username))
  }

  /**
   * Remove the property designation from a location. Called with a system token tied to the signed-in
   * user (`asSystem(username)`); the system client must hold the ROLE_PRISONER_PROPERTY__LOCATION_ADMIN
   * role. The API rejects removal (409) if the location still holds containers.
   */
  removePropertyLocation(id: string, username: string): Promise<PropertyLocationAdmin> {
    return this.delete<PropertyLocationAdmin>({ path: `/property-locations/${id}` }, asSystem(username))
  }
}

import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import type {
  ActiveAgency,
  AgencyStatus,
  BoxLocation,
  CombineContainersRequest,
  CreateContainerRequest,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonerTimelineItem,
  PrisonPropertyListQuery,
  PrisonPropertySummary,
  PropertyEvent,
  RemoveContainerRequest,
  RestPage,
  UpdateContainerRequest,
} from '../data/prisonerPropertyApiTypes'

export default class PrisonerPropertyService {
  constructor(private readonly prisonerPropertyApiClient: PrisonerPropertyApiClient) {}

  getPropertyForPrisoner(prisonerNumber: string, username: string): Promise<PrisonerPropertyContainer[]> {
    return this.prisonerPropertyApiClient.getPropertyForPrisoner(prisonerNumber, username)
  }

  getContainerEvents(id: string, username: string): Promise<PropertyEvent[]> {
    return this.prisonerPropertyApiClient.getContainerEvents(id, username)
  }

  getPrisonerPropertyHistory(prisonerNumber: string, username: string): Promise<PrisonerTimelineItem[]> {
    return this.prisonerPropertyApiClient.getPrisonerPropertyHistory(prisonerNumber, username)
  }

  getPrisonProperty(
    prisonId: string,
    query: PrisonPropertyListQuery,
    username: string,
  ): Promise<RestPage<PrisonerPropertyGroup>> {
    return this.prisonerPropertyApiClient.getPrisonProperty(prisonId, query, username)
  }

  getBoxLocations(
    prisonId: string,
    query: { query?: string; page?: number; size?: number },
    username: string,
  ): Promise<RestPage<BoxLocation>> {
    return this.prisonerPropertyApiClient.getBoxLocations(prisonId, query, username)
  }

  getPrisonPropertySummary(prisonId: string, username: string): Promise<PrisonPropertySummary> {
    return this.prisonerPropertyApiClient.getPrisonPropertySummary(prisonId, username)
  }

  createContainer(body: CreateContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.prisonerPropertyApiClient.createContainer(body, username)
  }

  removeContainer(id: string, body: RemoveContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.prisonerPropertyApiClient.removeContainer(id, body, username)
  }

  combineContainers(body: CombineContainersRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.prisonerPropertyApiClient.combineContainers(body, username)
  }

  updateContainer(id: string, body: UpdateContainerRequest, username: string): Promise<PrisonerPropertyContainer> {
    return this.prisonerPropertyApiClient.updateContainer(id, body, username)
  }

  getAllAgencies(username: string): Promise<AgencyStatus[]> {
    return this.prisonerPropertyApiClient.getAllAgencies(username)
  }

  setAgencyActive(agencyId: string, active: boolean, username: string): Promise<ActiveAgency> {
    return this.prisonerPropertyApiClient.setAgencyActive(agencyId, active, username)
  }
}

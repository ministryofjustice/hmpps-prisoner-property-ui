import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
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
}

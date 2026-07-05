import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import type {
  BoxLocation,
  CreateContainerRequest,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonPropertyListQuery,
  PrisonPropertySummary,
  PropertyEvent,
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
}

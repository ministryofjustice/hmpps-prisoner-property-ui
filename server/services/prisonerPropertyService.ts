import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import type {
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonPropertyListQuery,
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
}

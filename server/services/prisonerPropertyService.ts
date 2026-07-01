import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'

export default class PrisonerPropertyService {
  constructor(private readonly prisonerPropertyApiClient: PrisonerPropertyApiClient) {}

  getPropertyForPrisoner(prisonerNumber: string, username: string): Promise<PrisonerPropertyContainer[]> {
    return this.prisonerPropertyApiClient.getPropertyForPrisoner(prisonerNumber, username)
  }
}

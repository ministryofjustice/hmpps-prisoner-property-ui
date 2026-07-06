import { Readable } from 'stream'
import PrisonerSearchApiClient from '../data/prisonerSearchApiClient'
import PrisonApiClient from '../data/prisonApiClient'
import type { Prisoner } from '../data/prisonerSearchApiTypes'

export default class PrisonerService {
  constructor(
    private readonly prisonerSearchApiClient: PrisonerSearchApiClient,
    private readonly prisonApiClient: PrisonApiClient,
  ) {}

  getPrisonerDetails(prisonerNumber: string, username: string): Promise<Prisoner> {
    return this.prisonerSearchApiClient.getPrisoner(prisonerNumber, username)
  }

  getPrisonerImage(prisonerNumber: string, username: string): Promise<Readable> {
    return this.prisonApiClient.getPrisonerImage(prisonerNumber, username)
  }
}

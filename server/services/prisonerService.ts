import { Readable } from 'stream'
import PrisonerSearchApiClient from '../data/prisonerSearchApiClient'
import PrisonApiClient from '../data/prisonApiClient'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import type { RestPage } from '../data/prisonerPropertyApiTypes'
import {
  CASELOAD_CONDITION,
  deriveNomisState,
  NOMIS_PROPERTY_MODULE,
  NomisScreenNotSetUpError,
  type NomisScreenState,
} from '../utils/nomisSplash'
import logger from '../../logger'

export default class PrisonerService {
  constructor(
    private readonly prisonerSearchApiClient: PrisonerSearchApiClient,
    private readonly prisonApiClient: PrisonApiClient,
  ) {}

  getPrisonerDetails(prisonerNumber: string, username: string): Promise<Prisoner> {
    return this.prisonerSearchApiClient.getPrisoner(prisonerNumber, username)
  }

  searchPrisoners(
    term: string,
    prisonId: string,
    page: number,
    size: number,
    username: string,
  ): Promise<RestPage<Prisoner>> {
    return this.prisonerSearchApiClient.searchPrisoners(term, prisonId, page, size, username)
  }

  getPrisonerImage(prisonerNumber: string, username: string): Promise<Readable> {
    return this.prisonApiClient.getPrisonerImage(prisonerNumber, username)
  }

  /**
   * Read each prison's NOMIS property-screen state (Normal / Warning / Blocked) from the OIDMPCON
   * splash screen's caseload conditions. Returns a prisonId -> state map, or `null` if the screen
   * cannot be read (not set up yet, missing role, or prison-api down) so the admin list degrades to an
   * "unavailable" notice rather than failing.
   */
  async getNomisScreenStates(username: string): Promise<Map<string, NomisScreenState> | null> {
    try {
      const screen = await this.prisonApiClient.getSplashScreen(NOMIS_PROPERTY_MODULE, username)
      const states = new Map<string, NomisScreenState>()
      for (const condition of screen.conditions ?? []) {
        if (condition.conditionType === CASELOAD_CONDITION) {
          states.set(condition.conditionValue, condition.blockAccess ? 'BLOCKED' : 'WARNING')
        }
      }
      return states
    } catch (error) {
      logger.warn(`Failed to read NOMIS ${NOMIS_PROPERTY_MODULE} splash screen: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Move a prison's NOMIS property screen to the target state. Reads the screen first so the change is
   * idempotent — it adds, updates or removes the caseload condition depending on the current state,
   * never duplicating or acting on a missing condition. Throws `NomisScreenNotSetUpError` if the
   * OIDMPCON screen has not been created yet (its message text is configured manually first).
   */
  async setNomisScreenState(agencyId: string, target: NomisScreenState, username: string): Promise<void> {
    let conditions
    try {
      conditions = (await this.prisonApiClient.getSplashScreen(NOMIS_PROPERTY_MODULE, username)).conditions ?? []
    } catch (error) {
      if ((error as { responseStatus?: number }).responseStatus === 404) throw new NomisScreenNotSetUpError()
      throw error
    }

    const current = deriveNomisState(conditions, agencyId)
    if (current === target) return

    if (target === 'NORMAL') {
      await this.prisonApiClient.removeSplashCondition(NOMIS_PROPERTY_MODULE, CASELOAD_CONDITION, agencyId, username)
      return
    }

    const blockAccess = target === 'BLOCKED'
    if (current === 'NORMAL') {
      await this.prisonApiClient.addSplashCondition(
        NOMIS_PROPERTY_MODULE,
        CASELOAD_CONDITION,
        agencyId,
        blockAccess,
        username,
      )
    } else {
      await this.prisonApiClient.updateSplashCondition(
        NOMIS_PROPERTY_MODULE,
        CASELOAD_CONDITION,
        agencyId,
        blockAccess,
        username,
      )
    }
  }
}

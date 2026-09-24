import { Readable } from 'stream'
import PrisonerSearchApiClient from '../data/prisonerSearchApiClient'
import PrisonApiClient from '../data/prisonApiClient'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import type { RestPage } from '../data/prisonerPropertyApiTypes'
import type { SplashScreenCondition } from '../data/prisonApiTypes'
import {
  CASELOAD_CONDITION,
  deriveNomisState,
  NOMIS_PROPERTY_MODULES,
  NOMIS_PROPERTY_MODULES_TEXT,
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
   * splash screen's caseload conditions. Every property screen must be readable, so the admin console
   * never offers a change it could only half apply. Returns a prisonId -> state map, or `null` if any
   * screen cannot be read (not set up yet, missing role, or prison-api down) so the admin list degrades
   * to an "unavailable" notice rather than failing.
   */
  async getNomisScreenStates(username: string): Promise<Map<string, NomisScreenState> | null> {
    try {
      const screens = await Promise.all(
        NOMIS_PROPERTY_MODULES.map(module => this.prisonApiClient.getSplashScreen(module, username)),
      )
      const states = new Map<string, NomisScreenState>()
      for (const condition of screens[0].conditions ?? []) {
        if (condition.conditionType === CASELOAD_CONDITION) {
          states.set(condition.conditionValue, condition.blockAccess ? 'BLOCKED' : 'WARNING')
        }
      }
      return states
    } catch (error) {
      logger.warn(`Failed to read NOMIS ${NOMIS_PROPERTY_MODULES_TEXT} splash screens: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Move a prison's NOMIS property screens to the target state. Reads every screen before changing any,
   * throwing `NomisScreenNotSetUpError` if one has not been created yet (its message text is configured
   * manually first). Each screen is then changed independently and idempotently - its caseload condition
   * is added, updated or removed depending on that screen's own current state - so re-applying a state
   * brings a screen that is out of step back into line.
   */
  async setNomisScreenState(agencyId: string, target: NomisScreenState, username: string): Promise<void> {
    const screens = await Promise.all(
      NOMIS_PROPERTY_MODULES.map(async module => {
        try {
          return { module, conditions: (await this.prisonApiClient.getSplashScreen(module, username)).conditions ?? [] }
        } catch (error) {
          if ((error as { responseStatus?: number }).responseStatus === 404) throw new NomisScreenNotSetUpError(module)
          throw error
        }
      }),
    )

    for (const { module, conditions } of screens) {
      // eslint-disable-next-line no-await-in-loop
      await this.setScreenState(module, conditions, agencyId, target, username)
    }
  }

  private async setScreenState(
    module: string,
    conditions: SplashScreenCondition[],
    agencyId: string,
    target: NomisScreenState,
    username: string,
  ): Promise<void> {
    const current = deriveNomisState(conditions, agencyId)
    if (current === target) return

    if (target === 'NORMAL') {
      await this.prisonApiClient.removeSplashCondition(module, CASELOAD_CONDITION, agencyId, username)
      return
    }

    const blockAccess = target === 'BLOCKED'
    if (current === 'NORMAL') {
      await this.prisonApiClient.addSplashCondition(module, CASELOAD_CONDITION, agencyId, blockAccess, username)
    } else {
      await this.prisonApiClient.updateSplashCondition(module, CASELOAD_CONDITION, agencyId, blockAccess, username)
    }
  }
}

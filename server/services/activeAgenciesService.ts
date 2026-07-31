import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import logger from '../../logger'

/**
 * Resolves which prisons have the property service switched on in DPS, so the UI can allow edits only
 * for a "turned on" establishment (mutual exclusivity with NOMIS during rollout).
 *
 * Read live rather than cached. This ran on a five-minute TTL, and because the cache is per process an
 * admin switching a prison on only cleared it on the pod that served the toggle: every other pod kept
 * refusing writes, so staff saw roughly every other request fail with the "not authorised" page until
 * the TTL expired. There is no way to invalidate a per-pod cache from another pod, so the cache had to
 * go — the same conclusion the API reached about its own copy of this lookup. The read is cheap: the
 * API's `/info` is actuator-cached for two seconds over a small indexed table.
 */
export default class ActiveAgenciesService {
  /** Last successful read, used *only* when a refresh fails — never to serve a healthy request. */
  private lastKnownGood: Set<string> | null = null

  constructor(private readonly prisonerPropertyApiClient: PrisonerPropertyApiClient) {}

  /**
   * The set of agency ids active in DPS. Never throws: if the read fails it logs and falls back to the
   * last known set (or an empty set), so viewing never breaks — a transient failure at worst leaves
   * edits hidden and blocked, which is the safe default during rollout.
   */
  async getActiveAgencyIds(): Promise<Set<string>> {
    try {
      const ids = new Set(await this.prisonerPropertyApiClient.getActiveAgencyIds())
      this.lastKnownGood = ids
      return ids
    } catch (error) {
      logger.warn(`Failed to load active agencies: ${(error as Error).message}`)
      return this.lastKnownGood ?? new Set<string>()
    }
  }

  /** Whether the given prison is currently switched on in DPS. */
  async isPrisonActive(prisonId: string): Promise<boolean> {
    if (!prisonId) return false
    return (await this.getActiveAgencyIds()).has(prisonId)
  }
}

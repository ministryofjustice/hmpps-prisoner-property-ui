import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import logger from '../../logger'

// How long the set of DPS-active prisons is trusted before we refresh it from the API's `/info`
// endpoint. The list changes only when an admin toggles a prison during rollout, so a few minutes
// keeps the read path cheap while staying responsive. A toggle in the admin console also invalidates
// this cache in-process (see the admin route), so the acting admin sees the change immediately; the
// TTL is what converges other pods.
const ACTIVE_AGENCIES_TTL_MS = 5 * 60 * 1000

/**
 * Resolves which prisons have the property service switched on in DPS, so the UI can allow edits only
 * for a "turned on" establishment (mutual exclusivity with NOMIS during rollout). The active set is
 * national and non-user-specific, so a single process-wide cached Set with a short TTL is enough — no
 * Redis needed (mirrors UserService's name cache).
 */
export default class ActiveAgenciesService {
  private cache: { ids: Set<string>; expiry: number } | null = null

  constructor(private readonly prisonerPropertyApiClient: PrisonerPropertyApiClient) {}

  /**
   * The set of agency ids active in DPS, served from the short-lived cache when fresh. Never throws:
   * if the refresh fails it logs and returns the last-known set (or an empty set), so viewing never
   * breaks — a transient failure simply means edits stay hidden/blocked, which is the safe default.
   */
  async getActiveAgencyIds(): Promise<Set<string>> {
    const now = Date.now()
    if (this.cache && this.cache.expiry > now) {
      return this.cache.ids
    }

    try {
      const ids = new Set(await this.prisonerPropertyApiClient.getActiveAgencyIds())
      this.cache = { ids, expiry: now + ACTIVE_AGENCIES_TTL_MS }
      return ids
    } catch (error) {
      logger.warn(`Failed to load active agencies: ${(error as Error).message}`)
      return this.cache?.ids ?? new Set<string>()
    }
  }

  /** Whether the given prison is currently switched on in DPS. */
  async isPrisonActive(prisonId: string): Promise<boolean> {
    if (!prisonId) return false
    return (await this.getActiveAgencyIds()).has(prisonId)
  }

  /** Drop the cache so the next lookup refreshes from the API (called after an admin toggle). */
  invalidate(): void {
    this.cache = null
  }
}

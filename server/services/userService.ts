import ManageUsersApiClient from '../data/manageUsersApiClient'
import logger from '../../logger'

export interface ActiveCaseload {
  activeCaseloadId: string | null
  activeCaseloadName: string | null
  caseloadIds: string[]
}

// Sentinels the API records as the acting user for changes it makes itself: event-driven ones (prisoner
// received/released) and closures by the legacy clean-up. Neither is a real user, so they are never looked
// up and never shown as a name.
export const SYSTEM_USER = 'PRISONER_PROPERTY_API'
export const LEGACY_CLEANUP_USER = 'LEGACY_CLEANUP'
const SYSTEM_USERS = new Set([SYSTEM_USER, LEGACY_CLEANUP_USER])

// How long a resolved username -> name mapping is trusted before we look it up again. Names rarely
// change, and history is read-heavy, so an hour keeps manage-users-api traffic low.
const NAME_CACHE_TTL_MS = 60 * 60 * 1000

export default class UserService {
  // Process-wide cache of username -> display name. Small (bounded by the set of staff who have acted
  // on property) and short-lived, so a plain Map with per-entry expiry is enough — no Redis needed.
  private readonly nameCache = new Map<string, { name: string; expiry: number }>()

  constructor(private readonly manageUsersApiClient: ManageUsersApiClient) {}

  /**
   * Resolve the signed-in user's active caseload (and the ids of every caseload they hold, for
   * access checks) from manage-users-api, using the user's own token.
   */
  async getActiveCaseload(userToken: string): Promise<ActiveCaseload> {
    const caseloads = await this.manageUsersApiClient.getUserCaseloads(userToken)
    return {
      activeCaseloadId: caseloads.activeCaseload?.id ?? null,
      activeCaseloadName: caseloads.activeCaseload?.name ?? null,
      caseloadIds: (caseloads.caseloads ?? []).map(caseload => caseload.id),
    }
  }

  /**
   * Resolve a set of usernames to their display names for the property history/timeline. De-duplicates,
   * skips the system sentinel, serves from a short-lived cache, and — crucially — never throws: any
   * username that cannot be resolved is simply omitted, so callers fall back to the raw id and history
   * always renders. Returns a Map keyed by username.
   */
  async getUserDisplayNames(usernames: string[], callerUsername: string): Promise<Map<string, string>> {
    const resolved = new Map<string, string>()
    const now = Date.now()

    const toLookUp = [...new Set(usernames)].filter(username => {
      if (!username || SYSTEM_USERS.has(username)) return false
      const cached = this.nameCache.get(username)
      if (cached && cached.expiry > now) {
        resolved.set(username, cached.name)
        return false
      }
      return true
    })

    await Promise.all(
      toLookUp.map(async username => {
        try {
          const user = await this.manageUsersApiClient.getUser(username, callerUsername)
          if (user?.name) {
            this.nameCache.set(username, { name: user.name, expiry: now + NAME_CACHE_TTL_MS })
            resolved.set(username, user.name)
          }
        } catch (error) {
          logger.warn(`Failed to resolve name for user ${username}: ${(error as Error).message}`)
        }
      }),
    )

    return resolved
  }
}

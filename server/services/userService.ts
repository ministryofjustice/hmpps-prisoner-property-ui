import ManageUsersApiClient from '../data/manageUsersApiClient'

export interface ActiveCaseload {
  activeCaseloadId: string | null
  activeCaseloadName: string | null
  caseloadIds: string[]
}

export default class UserService {
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
}

// Types mirroring the manage-users-api responses we consume.

export interface Caseload {
  id: string
  name: string
}

// Response of GET /users/me/caseloads — the signed-in user's caseloads and their active one.
export interface UserCaseloads {
  username: string
  active: boolean
  accountType?: string
  activeCaseload: Caseload | null
  caseloads: Caseload[]
}

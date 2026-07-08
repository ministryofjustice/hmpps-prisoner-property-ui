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

// Response of GET /users/{username} — a user's details. We only need `name` (their display name) to
// show a friendly acting-staff name on the property history/timeline instead of the raw username.
export interface UserDetails {
  username: string
  name: string
  active?: boolean
  userId?: string
}

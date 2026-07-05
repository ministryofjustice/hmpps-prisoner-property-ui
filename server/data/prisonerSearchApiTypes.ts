// Types mirroring the responses from hmpps-prisoner-search.
// See the Prisoner model in hmpps-prisoner-search for the source of truth; only the subset of fields
// needed for the prisoner banner is modelled here.

export interface Prisoner {
  prisonerNumber: string
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  // Current establishment the prisoner is in (matches the active caseload when they are held here).
  prisonId: string | null
  prisonName: string | null
  cellLocation: string | null
  // Movement status, e.g. "ACTIVE IN".
  status: string | null
}

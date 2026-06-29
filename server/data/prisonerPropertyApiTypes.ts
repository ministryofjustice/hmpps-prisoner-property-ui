// Types mirroring the responses from hmpps-prisoner-property-api.
// See PrisonerPropertyContainerDto in the API for the source of truth.

export type ContainerStatus = 'STORED' | 'IN_TRANSFER' | 'DUE_RETURN' | 'DUE_DISPOSAL' | 'RETURNED' | 'DISPOSED'

export type ContainerType = 'STANDARD' | 'VALUABLES' | 'BULK'

export type StorageLocationType = 'INTERNAL' | 'BRANSTON'

export type RemovalOutcome = 'DISPOSED' | 'RETURNED' | 'TRANSFERRED' | 'COMBINED'

export interface PrisonerPropertyContainer {
  id: string
  prisonerNumber: string
  prisonerName: string | null
  prisonId: string
  prisonName: string | null
  inPrisonersCurrentPrison: boolean
  containerType: ContainerType
  currentSealNumber: string | null
  currentStatus: ContainerStatus
  currentLocation: string | null
  currentLocationType: StorageLocationType | null
  locationDescription: string | null
  proposedDisposalDate: string | null
  removalOutcome: RemovalOutcome | null
  removalDate: string | null
  createDateTime: string
  createdByUserId: string
  archived: boolean
}

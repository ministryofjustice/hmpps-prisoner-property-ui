// Types mirroring the responses from hmpps-prisoner-property-api.
// See PrisonerPropertyContainerDto / PrisonerPropertyGroupDto in the API for the source of truth.

export type ContainerStatus =
  'STORED' | 'DUE_FOR_TRANSFER_OUT' | 'DISPOSAL_REQUIRED' | 'DISPOSED' | 'RETURNED' | 'TRANSFER' | 'COMBINED'

export type ContainerType = 'STANDARD' | 'EXCESS' | 'VALUABLES' | 'CONFISCATED'

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

// A single prisoner's property containers, grouped for the establishment-wide list. The list endpoint
// pages by prisoner (a prisoner's containers are never split across a page boundary).
export interface PrisonerPropertyGroup {
  prisonerNumber: string
  prisonerName: string | null
  prisonerCurrentPrisonId: string | null
  prisonerCurrentPrisonName: string | null
  containers: PrisonerPropertyContainer[]
}

export type PropertyEventType =
  | 'CREATED_SEALED'
  | 'SEAL_CHANGED'
  | 'CONTAINER_TYPE_CHANGE'
  | 'MOVED'
  | 'PRISONER_RECEIVED'
  | 'TRANSFERRED'
  | 'RETURNED'
  | 'DISPOSAL_REQUIRED'
  | 'DISPOSED'
  | 'COMBINED'

// A single event in a container's history (GET /property-containers/{id}/events), newest first.
// See PropertyEventDto in the API for the source of truth. Each event carries only the fields
// relevant to it; the rest are null.
export interface PropertyEvent {
  id: string
  eventType: PropertyEventType
  eventDateTime: string
  eventUserId: string
  sealNumber: string | null
  fromInternalLocationId: string | null
  toInternalLocationId: string | null
  toStorageLocationType: StorageLocationType | null
  fromPrisonId: string | null
  toPrisonId: string | null
  eventDate: string | null
  relatedContainerId: string | null
}

// Filters + paging for the establishment-wide list (GET /property-containers/prison/{prisonId}).
// All filters are exact-match on the API side; omit a field to leave it unfiltered.
export interface PrisonPropertyListQuery {
  prisonerNumber?: string
  sealNumber?: string
  containerType?: ContainerType
  status?: ContainerStatus[]
  storageLocation?: string
  page?: number
  size?: number
}

// Minimal shape of a Spring Data `Page<T>` as serialised to JSON.
export interface RestPage<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  numberOfElements: number
  first: boolean
  last: boolean
}

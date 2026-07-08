// Types mirroring the responses from hmpps-prisoner-property-api.
// See PrisonerPropertyContainerDto / PrisonerPropertyGroupDto in the API for the source of truth.

export type ContainerStatus =
  | 'STORED'
  | 'DUE_FOR_TRANSFER_OUT'
  | 'DISPOSAL_REQUIRED'
  | 'DISPOSED'
  | 'RETURNED'
  | 'TRANSFER'
  | 'COMBINED'
  | 'CREATED_IN_ERROR'

export type ContainerType = 'STANDARD' | 'EXCESS' | 'VALUABLES' | 'CONFISCATED'

export type StorageLocationType = 'INTERNAL' | 'BRANSTON'

export type RemovalOutcome = 'DISPOSED' | 'RETURNED' | 'TRANSFERRED' | 'COMBINED' | 'CREATED_IN_ERROR'

// Where the prisoner is, from prisoner-search: held in an establishment, in transit between prisons, or released.
export type PrisonerMovementStatus = 'IN_ESTABLISHMENT' | 'IN_TRANSIT' | 'RELEASED'

export interface PrisonerPropertyContainer {
  id: string
  prisonerNumber: string
  prisonerName: string | null
  prisonId: string
  prisonName: string | null
  prisonerCurrentPrisonId?: string | null
  prisonerCurrentPrisonName?: string | null
  prisonerMovementStatus?: PrisonerMovementStatus | null
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
  prisonerMovementStatus?: PrisonerMovementStatus | null
  containers: PrisonerPropertyContainer[]
}

// Whole-prison property summary counts for the establishment summary tiles
// (GET /property-containers/prison/{prisonId}/summary). See PrisonPropertySummaryDto in the API.
export interface PrisonPropertySummary {
  availableStorageLocations: number
  storedOnSite: number
  dueToTransferOut: number
  dueToBeReturned: number
  dueToBeDisposed: number
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
  | 'CREATED_IN_ERROR'

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

export type TimelineItemType = 'CONTAINER_EVENT' | 'PRISONER_MOVEMENT'

// A single item in a prisoner's whole-property history timeline
// (GET /property-containers/prisoner/{prisonerNumber}/events), newest first. See
// PrisonerTimelineItemDto in the API for the source of truth. Prison and location ids are already
// resolved to names; seal number and acting establishment are the values as at that point in the
// container's history. Container fields are null for prisoner-movement items.
export interface PrisonerTimelineItem {
  itemType: TimelineItemType
  eventId: string
  eventType: PropertyEventType | null
  eventStatus: ContainerStatus | null
  eventDateTime: string
  eventDate: string | null
  eventUserId: string
  systemGenerated: boolean
  prisonerName: string | null
  actingEstablishmentName: string | null
  fromPrisonName: string | null
  toPrisonName: string | null
  toStorageLocationType: StorageLocationType | null
  sealNumber: string | null
  relatedContainerId: string | null
  containerId: string | null
  containerType: ContainerType | null
  containerSealNumber: string | null
  containerStatus: ContainerStatus | null
  containerLocationDescription: string | null
}

// A property box location within a prison (GET /property-containers/prison/{prisonId}/box-locations),
// annotated with how many containers it currently holds. See BoxLocationDto in the API.
export interface BoxLocation {
  id: string
  prisonId: string
  code: string
  localName: string | null
  pathHierarchy: string
  name: string
  containerCount: number
}

// Payload to create a new container (POST /property-containers). See CreatePropertyContainerRequest
// in the API. Required: prisonerNumber, prisonId, containerType, sealNumber.
export interface CreateContainerRequest {
  prisonerNumber: string
  prisonId: string
  containerType: ContainerType
  sealNumber: string
  previousSealNumber?: string
  internalLocationId?: string
  proposedDisposalDate?: string
}

// Payload to remove a container from active storage (POST /property-containers/{id}/remove). See
// RemoveContainerRequest in the API. `outcome` is one of RETURNED/DISPOSED/CREATED_IN_ERROR (terminal)
// or TRANSFERRED (reassigns the container to `toPrisonId`, which is then required). `date` defaults to
// today on the API when omitted.
export interface RemoveContainerRequest {
  outcome: RemovalOutcome
  date?: string
  toPrisonId?: string
}

// Payload to combine two or more containers into a new sealed container (POST
// /property-containers/combine). See CombineContainersRequest in the API. The sources must all belong
// to one prisoner + prison and be active. `locationType` defaults to INTERNAL when an internal location
// id is given; use BRANSTON (with no internal location) for off-site excess property.
export interface CombineContainersRequest {
  sourceContainerIds: string[]
  containerType: ContainerType
  sealNumber: string
  internalLocationId?: string
  locationType?: StorageLocationType
}

// Filters + paging for the establishment-wide list (GET /property-containers/prison/{prisonId}).
// `query` is a free-text OR match over prisoner number, seal number and storage location; the other
// filters are exact-match. Omit a field to leave it unfiltered.
export interface PrisonPropertyListQuery {
  query?: string
  prisonerNumber?: string
  sealNumber?: string
  containerType?: ContainerType[]
  status?: ContainerStatus[]
  storageLocation?: string
  includeRemoved?: boolean
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

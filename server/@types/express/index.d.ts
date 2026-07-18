import { HmppsUser } from '../../interfaces/hmppsUser'
import { ContainerType, RemovalOutcome } from '../../data/prisonerPropertyApiTypes'

// One container being added within the multi-add journey. Excess property can be stored either off-site at
// Branston (storageChoice 'branston', no internalLocationId) or in a prison location (storageChoice
// 'internal' + internalLocationId); storageChoice is only used for excess and is undefined until chosen.
export interface AddContainerDraft {
  sealNumber?: string
  previousSealNumber?: string
  containerType?: ContainerType
  proposedDisposalDate?: string // ISO yyyy-mm-dd
  storageChoice?: 'branston' | 'internal'
  internalLocationId?: string
  locationName?: string
}

// Working state for the multi-step "add a property container" journey (one or more containers for one
// person). `origin` records where the user started so we return them there afterwards. Cleared on
// confirm/cancel.
export interface AddContainerJourney {
  prisonerNumber: string
  origin: 'list' | 'person'
  containers: AddContainerDraft[]
}

// Working state for the multi-step "remove a property container" journey. Cleared on confirm/cancel.
// `origin` records where the user started (the establishment list or a person view) so we return them
// there afterwards. `toPrisonId` is the resolved receiving prison for a TRANSFERRED outcome.
export interface RemoveContainerJourney {
  prisonerNumber: string
  containerId: string
  origin: 'list' | 'person'
  outcome?: RemovalOutcome
  toPrisonId?: string
}

// Working state for the multi-step "change a property container" journey. Cleared on confirm/cancel.
// `origin` records where the user started (list or person view). `locationChoice` is 'current' (keep the
// existing storage location) or 'new' (pick one via the box picker). For excess property, `storageChoice`
// records whether it is stored off-site at Branston or in a prison location (the current/new choice does not
// apply); undefined for non-excess.
export interface ChangeContainerJourney {
  prisonerNumber: string
  containerId: string
  origin: 'list' | 'person'
  sealNumber?: string
  containerType?: ContainerType
  proposedDisposalDate?: string // ISO yyyy-mm-dd
  locationChoice?: 'current' | 'new'
  storageChoice?: 'branston' | 'internal'
  internalLocationId?: string
  locationName?: string
}

// Working state for the multi-step "combine property containers" journey. Cleared on confirm/cancel.
// The sources are the ticked containers from the person view; the rest describe the new combined
// container. `locationType` is BRANSTON (off-site) for excess property, otherwise INTERNAL.
export interface CombineJourney {
  prisonerNumber: string
  sourceContainerIds: string[]
  sealNumber?: string
  containerType?: ContainerType
  proposedDisposalDate?: string // ISO yyyy-mm-dd
  locationType?: 'INTERNAL' | 'BRANSTON'
  internalLocationId?: string
  locationName?: string
}

export declare module 'express-session' {
  // Declare that the session will potentially contain these additional fields
  interface SessionData {
    returnTo: string
    addContainerJourney?: AddContainerJourney
    removeContainerJourney?: RemoveContainerJourney
    combineJourney?: CombineJourney
    changeContainerJourney?: ChangeContainerJourney
    // Where to return to (a "Select a storage location" page) after managing storage locations.
    manageLocationsReturnTo?: string
  }
}

export declare global {
  namespace Express {
    interface User {
      username: string
      token: string
      authSource: string
    }

    interface Request {
      verified?: boolean
      id: string
      logout(done: (err: unknown) => void): void
    }

    interface Locals {
      user: HmppsUser
      cspNonce: string
      csrfToken: string
      asset_path: string
      applicationName: string
      environmentName: string
      environmentNameColour: string
      appInsightsConnectionString?: string
      appInsightsApplicationName?: string
      buildNumber?: string
    }
  }
}

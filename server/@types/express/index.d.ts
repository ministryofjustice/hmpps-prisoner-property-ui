import { HmppsUser } from '../../interfaces/hmppsUser'
import { ContainerType, RemovalOutcome } from '../../data/prisonerPropertyApiTypes'

// Working state for the multi-step "add a property container" journey. Cleared on confirm/cancel.
export interface AddContainerJourney {
  prisonerNumber: string
  sealNumber?: string
  previousSealNumber?: string
  containerType?: ContainerType
  proposedDisposalDate?: string // ISO yyyy-mm-dd
  internalLocationId?: string
  locationName?: string
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

export declare module 'express-session' {
  // Declare that the session will potentially contain these additional fields
  interface SessionData {
    returnTo: string
    addContainerJourney?: AddContainerJourney
    removeContainerJourney?: RemoveContainerJourney
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

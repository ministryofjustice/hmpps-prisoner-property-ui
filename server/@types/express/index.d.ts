import { HmppsUser } from '../../interfaces/hmppsUser'
import { ContainerType } from '../../data/prisonerPropertyApiTypes'

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

export declare module 'express-session' {
  // Declare that the session will potentially contain these additional fields
  interface SessionData {
    returnTo: string
    addContainerJourney?: AddContainerJourney
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

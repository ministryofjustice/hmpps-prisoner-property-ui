import type { Request, Response, NextFunction } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { isPrisonerNumber } from '../utils/propertyList'
import { canManageLocations } from '../middleware/requireLocationAdminRole'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'

// Page size for the "Select a storage location" (box location) searches shared by the write journeys.
export const BOX_PAGE_SIZE = 20

// The per-request context every write journey needs: which prisoner, and the user's active caseload.
export interface JourneyContext {
  prisonerNumber: string
  activeCaseloadId: string
  activeCaseloadName: string | null
}

// Shared guard for every journey step: require an active caseload and a valid prisoner number.
// Returns null (after responding) when the caller should stop.
export const resolveContext = async (
  userService: Services['userService'],
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<JourneyContext | null> => {
  const { token } = res.locals.user
  const prisonerNumber = String(req.params.prisonerNumber)
  const { activeCaseloadId, activeCaseloadName } = await userService.getActiveCaseload(token)
  if (!activeCaseloadId) {
    res.render('pages/noCaseload')
    return null
  }
  if (!isPrisonerNumber(prisonerNumber)) {
    next(createError(404, 'Prisoner not found'))
    return null
  }
  return { prisonerNumber, activeCaseloadId, activeCaseloadName }
}

// Resolve the container from the prisoner's own active property so the URL is coherent (it belongs to
// this prisoner) and we have its enriched details for the screens. Returns null when it is not found
// or has already been removed, so the caller can 404.
export const loadRemovableContainer = async (
  prisonerPropertyService: Services['prisonerPropertyService'],
  prisonerNumber: string,
  id: string,
  username: string,
): Promise<PrisonerPropertyContainer | null> => {
  const containers = await prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username)
  const container = containers.find(c => c.id === id)
  if (!container || container.removalOutcome) return null
  return container
}

// Split an ISO date (yyyy-mm-dd) into the day/month/year parts a GOV.UK date input expects.
export const isoToParts = (iso?: string): { day: string; month: string; year: string } => {
  if (!iso) return { day: '', month: '', year: '' }
  const [year, month, day] = iso.split('-')
  return { day: String(Number(day)), month: String(Number(month)), year: year ?? '' }
}

/**
 * The manage-storage-locations button href for a "Select a storage location" page, or undefined for users
 * without the location-admin role. Carries the current journey URL as returnTo so the management area can
 * offer a breadcrumb back to this exact search.
 */
export function manageLocationsHrefFor(req: Request, userRoles: string[]): string | undefined {
  return canManageLocations(userRoles) ? `/admin/locations?returnTo=${encodeURIComponent(req.originalUrl)}` : undefined
}

/** Whether a returnTo value is a safe local path back to a "Select a storage location" journey page. */
export function isSafeLocationReturnTo(returnTo: unknown): returnTo is string {
  return (
    typeof returnTo === 'string' &&
    returnTo.startsWith('/prisoner/') &&
    !returnTo.startsWith('//') &&
    returnTo.includes('/location') &&
    !returnTo.includes('://')
  )
}

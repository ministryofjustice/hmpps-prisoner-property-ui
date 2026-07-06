import config from '../config'
import { convertToTitleCase } from './utils'
import type { Prisoner } from '../data/prisonerSearchApiTypes'

export interface PrisonerBanner {
  prisonerNumber: string
  // Display name in "Lastname, Firstname" order, as shown in the banner.
  name: string
  dateOfBirth: string | null
  establishment: string | null
  cellLocation: string | null
  status: string | null
  // True when the prisoner is currently held in the establishment being viewed (the active caseload).
  // Cell number and status are only shown in this case.
  inThisEstablishment: boolean
  // Link to the prisoner's DPS profile.
  profileUrl: string
}

/**
 * Build the prisoner banner view-model from prisoner-search details, relative to the establishment
 * being viewed (the user's active caseload). Cell number and status are only meaningful — and only
 * rendered — while the prisoner is held in the viewed establishment.
 */
export const buildPrisonerBanner = (
  prisonerNumber: string,
  prisoner: Prisoner,
  viewedPrisonId: string,
): PrisonerBanner => ({
  prisonerNumber,
  name: convertToTitleCase([prisoner.lastName, prisoner.firstName].filter(Boolean).join(', ')),
  dateOfBirth: prisoner.dateOfBirth,
  establishment: prisoner.prisonName,
  cellLocation: prisoner.cellLocation,
  status: prisoner.status,
  inThisEstablishment: prisoner.prisonId != null && prisoner.prisonId === viewedPrisonId,
  profileUrl: `${config.serviceUrls.digitalPrison}/prisoner/${prisonerNumber}`,
})

/**
 * Fallback banner used when prisoner-search details are unavailable (e.g. a 404). The page still
 * renders with the name known from the property records; the photo route falls back to the placeholder,
 * and cell/status/DOB are omitted.
 */
export const fallbackPrisonerBanner = (prisonerNumber: string, name: string | null): PrisonerBanner => ({
  prisonerNumber,
  name: convertToTitleCase(name) || 'Unknown',
  dateOfBirth: null,
  establishment: null,
  cellLocation: null,
  status: null,
  inThisEstablishment: false,
  profileUrl: `${config.serviceUrls.digitalPrison}/prisoner/${prisonerNumber}`,
})

import { ALL_CONTAINER_TYPES } from './propertyList'
import type { ContainerType } from '../data/prisonerPropertyApiTypes'

export interface DetailsForm {
  sealNumber?: string
  previousSealNumber?: string
  containerType?: string
  'disposalDate-day'?: string
  'disposalDate-month'?: string
  'disposalDate-year'?: string
}

export interface ParsedDetails {
  sealNumber: string
  previousSealNumber?: string
  containerType: ContainerType
  proposedDisposalDate?: string // ISO yyyy-mm-dd
}

export interface FieldError {
  text: string
  href: string
}

const trim = (value?: string): string => (value ?? '').trim()

/**
 * Assemble an optional GOV.UK 3-part date into an ISO yyyy-mm-dd string.
 * - all three parts blank -> { iso: undefined } (no date, which is valid, the field is optional)
 * - otherwise all three are required and must form a real calendar date.
 */
export const parseOptionalDate = (day?: string, month?: string, year?: string): { iso?: string; error?: string } => {
  const d = trim(day)
  const m = trim(month)
  const y = trim(year)

  if (!d && !m && !y) return {}
  if (!d || !m || !y) return { error: 'Enter a complete disposal date, or leave all parts blank' }

  const dayNum = Number(d)
  const monthNum = Number(m)
  const yearNum = Number(y)
  if (!Number.isInteger(dayNum) || !Number.isInteger(monthNum) || !Number.isInteger(yearNum) || y.length !== 4) {
    return { error: 'Enter a real disposal date' }
  }

  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum))
  const isRealDate =
    date.getUTCFullYear() === yearNum && date.getUTCMonth() === monthNum - 1 && date.getUTCDate() === dayNum
  if (!isRealDate) return { error: 'Enter a real disposal date' }

  const iso = `${yearNum.toString().padStart(4, '0')}-${monthNum.toString().padStart(2, '0')}-${dayNum
    .toString()
    .padStart(2, '0')}`
  return { iso }
}

/**
 * Validate the "add container details" form. Returns the parsed values when valid, or a list of
 * GOV.UK error-summary entries (keyed by field) when not.
 */
export const validateDetails = (form: DetailsForm): { values?: ParsedDetails; errors: Record<string, FieldError> } => {
  const errors: Record<string, FieldError> = {}

  const sealNumber = trim(form.sealNumber)
  if (!sealNumber) {
    errors.sealNumber = { text: "Enter the property container's current seal number", href: '#sealNumber' }
  }

  const containerType = trim(form.containerType)
  if (!ALL_CONTAINER_TYPES.includes(containerType as ContainerType)) {
    errors.containerType = { text: 'Select the type of property', href: '#containerType' }
  }

  const date = parseOptionalDate(form['disposalDate-day'], form['disposalDate-month'], form['disposalDate-year'])
  if (date.error) {
    errors.disposalDate = { text: date.error, href: '#disposalDate-day' }
  }

  if (Object.keys(errors).length > 0) return { errors }

  return {
    values: {
      sealNumber,
      previousSealNumber: trim(form.previousSealNumber) || undefined,
      containerType: containerType as ContainerType,
      proposedDisposalDate: date.iso,
    },
    errors: {},
  }
}

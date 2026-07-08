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

// The raw shape of one container block posted from the multi-add details form
// (containers[i][sealNumber], containers[i][disposalDate][day], ...).
export interface ContainerBlock {
  sealNumber?: string
  previousSealNumber?: string
  containerType?: string
  disposalDate?: { day?: string; month?: string; year?: string }
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

/**
 * Normalise the posted `containers` value into an ordered array of blocks. `qs` parses `containers[0][x]`
 * into an array, but a single or sparse set can arrive as an object keyed by index - coerce either to an
 * array. Always returns at least one (empty) block.
 */
export const toContainerBlocks = (raw: unknown): ContainerBlock[] => {
  if (Array.isArray(raw)) return raw.length ? (raw as ContainerBlock[]) : [{}]
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw as Record<string, ContainerBlock>)
    return values.length ? values : [{}]
  }
  return [{}]
}

/**
 * Validate every container block from the multi-add details form. Returns the parsed values when all are
 * valid, or a flat list of GOV.UK error-summary entries whose hrefs anchor to `#containers-{index}-{field}`
 * (prefixed with "Container N:" when there is more than one).
 */
export const validateContainers = (blocks: ContainerBlock[]): { values?: ParsedDetails[]; errors: FieldError[] } => {
  const errors: FieldError[] = []
  const values: ParsedDetails[] = []
  const many = blocks.length > 1
  blocks.forEach((block, index) => {
    const { values: parsed, errors: blockErrors } = validateDetails({
      sealNumber: block.sealNumber,
      previousSealNumber: block.previousSealNumber,
      containerType: block.containerType,
      'disposalDate-day': block.disposalDate?.day,
      'disposalDate-month': block.disposalDate?.month,
      'disposalDate-year': block.disposalDate?.year,
    })
    if (parsed) values.push(parsed)
    Object.entries(blockErrors).forEach(([field, err]) => {
      errors.push({
        text: many ? `Container ${index + 1}: ${err.text}` : err.text,
        href: `#containers-${index}-${field}`,
      })
    })
  })
  return errors.length ? { errors } : { values, errors: [] }
}

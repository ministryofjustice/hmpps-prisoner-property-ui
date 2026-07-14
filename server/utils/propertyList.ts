import type { ParsedQs } from 'qs'
import type {
  ContainerStatus,
  ContainerType,
  PersonLocation,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonPropertyListQuery,
} from '../data/prisonerPropertyApiTypes'

export const DEFAULT_PAGE_SIZE = 50
const PRISON_NUMBER_PATTERN = /^[A-Za-z]\d{4}[A-Za-z]{2}$/

const STATUS_TAGS: Record<ContainerStatus, { text: string; classes: string }> = {
  STORED: { text: 'Stored', classes: 'govuk-tag--green' },
  DUE_FOR_TRANSFER_OUT: { text: 'Due for transfer out', classes: 'govuk-tag--yellow' },
  DUE_FOR_RETURN: { text: 'Due for return', classes: 'govuk-tag--yellow' },
  DISPOSAL_REQUIRED: { text: 'Due for disposal', classes: 'govuk-tag--orange' },
  DISPOSED: { text: 'Disposed', classes: 'govuk-tag--red' },
  RETURNED: { text: 'Returned', classes: 'govuk-tag--green' },
  TRANSFER: { text: 'Transferred', classes: 'govuk-tag--grey' },
  COMBINED: { text: 'Combined', classes: 'govuk-tag--grey' },
  CREATED_IN_ERROR: { text: 'Created in error', classes: 'govuk-tag--grey' },
}

const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  STANDARD: 'Standard',
  EXCESS: 'Excess',
  VALUABLES: 'Valuables',
  CONFISCATED: 'Confiscated',
}

export const ALL_STATUSES = Object.keys(STATUS_TAGS) as ContainerStatus[]
export const ALL_CONTAINER_TYPES = Object.keys(CONTAINER_TYPE_LABELS) as ContainerType[]
const ALL_PERSON_LOCATIONS: PersonLocation[] = ['IN_ESTABLISHMENT', 'LEFT_ESTABLISHMENT']

export const isPrisonerNumber = (value: string): boolean => PRISON_NUMBER_PATTERN.test(value)

export const statusTag = (status: ContainerStatus): { text: string; classes: string } =>
  STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

export const containerTypeLabel = (type: ContainerType): string => CONTAINER_TYPE_LABELS[type] ?? type

export const containerLocation = (container: PrisonerPropertyContainer): string => {
  if (container.currentLocationType === 'BRANSTON') return 'Branston (offsite)'
  return container.locationDescription || '-'
}

/**
 * The "Prisoner establishment" column label for a group. A prisoner mid-move has no resolvable
 * establishment name, so describe their movement instead: in transit -> "Transferring", released ->
 * "Released"; otherwise the current establishment name (or "Not known").
 */
export const establishmentLabel = (group: PrisonerPropertyGroup): string => {
  if (group.prisonerMovementStatus === 'IN_TRANSIT') return 'Transferring'
  if (group.prisonerMovementStatus === 'RELEASED') return 'Released'
  return group.prisonerCurrentPrisonName || 'Not known'
}

const firstValue = (value: string | ParsedQs | (string | ParsedQs)[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.toString().trim() || undefined

const toArray = (value: string | ParsedQs | (string | ParsedQs)[] | undefined): string[] =>
  (Array.isArray(value) ? value : [value])
    .map(item => item?.toString().trim())
    .filter((item): item is string => Boolean(item))

export interface ParsedPropertyListQuery {
  search: string
  containerTypes: ContainerType[]
  statuses: ContainerStatus[]
  includeRemoved: boolean
  personLocations: PersonLocation[]
  page: number
  apiQuery: PrisonPropertyListQuery
}

/** Parse and whitelist the establishment-list request query into filter + paging values. */
export const parsePropertyListQuery = (reqQuery: ParsedQs, size = DEFAULT_PAGE_SIZE): ParsedPropertyListQuery => {
  const search = firstValue(reqQuery.q) ?? ''
  const containerTypes = toArray(reqQuery.containerType).filter((type): type is ContainerType =>
    ALL_CONTAINER_TYPES.includes(type as ContainerType),
  )
  const statuses = toArray(reqQuery.status).filter((status): status is ContainerStatus =>
    ALL_STATUSES.includes(status as ContainerStatus),
  )
  const personLocations = toArray(reqQuery.personLocation).filter((value): value is PersonLocation =>
    ALL_PERSON_LOCATIONS.includes(value as PersonLocation),
  )
  const includeRemoved = firstValue(reqQuery.includeRemoved) === 'true'
  const parsedPage = Number.parseInt(firstValue(reqQuery.page) ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const apiQuery: PrisonPropertyListQuery = {
    // The API `query` param does an OR match over prisoner number, seal number and storage location.
    query: search || undefined,
    containerType: containerTypes.length ? containerTypes : undefined,
    status: statuses.length ? statuses : undefined,
    includeRemoved: includeRemoved || undefined,
    // In vs no-longer-in are complementary, so only a single ticked box narrows the list; both/neither is
    // "everyone" and sends nothing.
    personLocation: personLocations.length === 1 ? personLocations[0] : undefined,
    page: page - 1, // API pages are zero-based
    size,
  }

  return { search, containerTypes, statuses, includeRemoved, personLocations, page, apiQuery }
}

export interface PaginationItem {
  text?: number
  href?: string
  selected?: boolean
  type?: 'dots'
}

export interface Pagination {
  results: { from: number; to: number; count: number }
  previous?: { text: string; href: string }
  next?: { text: string; href: string }
  items: PaginationItem[]
}

/**
 * Build a MoJ pagination view model. `page` is 1-based; `baseQuery` is the current query string
 * without the page param (each item appends its own page).
 */
export const buildPagination = (
  page: number,
  totalPages: number,
  totalElements: number,
  size: number,
  baseQuery: string,
): Pagination => {
  const href = (targetPage: number): string => {
    const params = new URLSearchParams(baseQuery)
    params.set('page', targetPage.toString())
    return `?${params.toString()}`
  }

  const items: PaginationItem[] = []
  let previousWasGap = false
  for (let candidate = 1; candidate <= totalPages; candidate += 1) {
    const nearEnds = candidate === 1 || candidate === totalPages
    const nearCurrent = Math.abs(candidate - page) <= 1
    if (nearEnds || nearCurrent) {
      items.push({ text: candidate, href: href(candidate), selected: candidate === page })
      previousWasGap = false
    } else if (!previousWasGap) {
      items.push({ type: 'dots' })
      previousWasGap = true
    }
  }

  const from = totalElements === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, totalElements)

  return {
    results: { from, to, count: totalElements },
    previous: page > 1 ? { text: 'Previous', href: href(page - 1) } : undefined,
    next: page < totalPages ? { text: 'Next', href: href(page + 1) } : undefined,
    items,
  }
}

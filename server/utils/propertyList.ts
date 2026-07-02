import type { ParsedQs } from 'qs'
import type {
  ContainerStatus,
  ContainerType,
  PrisonerPropertyContainer,
  PrisonPropertyListQuery,
} from '../data/prisonerPropertyApiTypes'

export const DEFAULT_PAGE_SIZE = 20
const PRISON_NUMBER_PATTERN = /^[A-Za-z]\d{4}[A-Za-z]{2}$/

const STATUS_TAGS: Record<ContainerStatus, { text: string; classes: string }> = {
  STORED: { text: 'Stored', classes: 'govuk-tag--blue' },
  DUE_FOR_TRANSFER_OUT: { text: 'Due for transfer out', classes: 'govuk-tag--yellow' },
  DISPOSAL_REQUIRED: { text: 'Due for disposal', classes: 'govuk-tag--orange' },
  DISPOSED: { text: 'Disposed', classes: 'govuk-tag--red' },
  RETURNED: { text: 'Returned', classes: 'govuk-tag--green' },
  TRANSFER: { text: 'Transferred', classes: 'govuk-tag--grey' },
  COMBINED: { text: 'Combined', classes: 'govuk-tag--grey' },
}

const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  STANDARD: 'Standard',
  EXCESS: 'Excess',
  VALUABLES: 'Valuables',
  CONFISCATED: 'Confiscated',
}

export const ALL_STATUSES = Object.keys(STATUS_TAGS) as ContainerStatus[]
export const ALL_CONTAINER_TYPES = Object.keys(CONTAINER_TYPE_LABELS) as ContainerType[]

export const isPrisonerNumber = (value: string): boolean => PRISON_NUMBER_PATTERN.test(value)

export const statusTag = (status: ContainerStatus): { text: string; classes: string } =>
  STATUS_TAGS[status] ?? { text: status, classes: 'govuk-tag--grey' }

export const containerTypeLabel = (type: ContainerType): string => CONTAINER_TYPE_LABELS[type] ?? type

export const containerLocation = (container: PrisonerPropertyContainer): string => {
  if (container.currentLocationType === 'BRANSTON') return 'Branston (offsite)'
  return container.locationDescription || '-'
}

const firstValue = (value: string | ParsedQs | (string | ParsedQs)[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.toString().trim() || undefined

const toArray = (value: string | ParsedQs | (string | ParsedQs)[] | undefined): string[] =>
  (Array.isArray(value) ? value : [value])
    .map(item => item?.toString().trim())
    .filter((item): item is string => Boolean(item))

/**
 * Route a single free-text search term to an exact-match API filter: a full prison number
 * (e.g. A1234BC) filters by prisonerNumber, anything else is treated as a seal number.
 * (Name search is not supported by the API yet.)
 */
export const searchToFilters = (search?: string): Pick<PrisonPropertyListQuery, 'prisonerNumber' | 'sealNumber'> => {
  if (!search) return {}
  return PRISON_NUMBER_PATTERN.test(search) ? { prisonerNumber: search.toUpperCase() } : { sealNumber: search }
}

export interface ParsedPropertyListQuery {
  search: string
  containerType?: ContainerType
  statuses: ContainerStatus[]
  storageLocation?: string
  page: number
  apiQuery: PrisonPropertyListQuery
}

/** Parse and whitelist the establishment-list request query into filter + paging values. */
export const parsePropertyListQuery = (reqQuery: ParsedQs, size = DEFAULT_PAGE_SIZE): ParsedPropertyListQuery => {
  const search = firstValue(reqQuery.q) ?? ''
  const containerTypeRaw = firstValue(reqQuery.containerType)
  const containerType = ALL_CONTAINER_TYPES.includes(containerTypeRaw as ContainerType)
    ? (containerTypeRaw as ContainerType)
    : undefined
  const statuses = toArray(reqQuery.status).filter((status): status is ContainerStatus =>
    ALL_STATUSES.includes(status as ContainerStatus),
  )
  const storageLocation = firstValue(reqQuery.storageLocation)
  const parsedPage = Number.parseInt(firstValue(reqQuery.page) ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const apiQuery: PrisonPropertyListQuery = {
    ...searchToFilters(search),
    containerType,
    status: statuses.length ? statuses : undefined,
    storageLocation,
    page: page - 1, // API pages are zero-based
    size,
  }

  return { search, containerType, statuses, storageLocation, page, apiQuery }
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

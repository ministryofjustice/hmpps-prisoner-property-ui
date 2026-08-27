import type { ParsedQs } from 'qs'
import type {
  ContainerStatus,
  ContainerType,
  PersonLocation,
  PrisonerMovementStatus,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonPropertyListQuery,
} from '../data/prisonerPropertyApiTypes'
import { ALL_CONTAINER_STATUSES, containerStatusTag } from './statusTags'

export const DEFAULT_PAGE_SIZE = 50
const PRISON_NUMBER_PATTERN = /^[A-Za-z]\d{4}[A-Za-z]{2}$/

const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  STANDARD: 'Standard',
  EXCESS: 'Excess',
  VALUABLES: 'Valuables',
  CONFISCATED: 'Confiscated',
}

export const ALL_STATUSES = ALL_CONTAINER_STATUSES
export const ALL_CONTAINER_TYPES = Object.keys(CONTAINER_TYPE_LABELS) as ContainerType[]
const ALL_PERSON_LOCATIONS: PersonLocation[] = ['IN_ESTABLISHMENT', 'LEFT_ESTABLISHMENT']

// A pseudo-status the "Due for transfer in" checkbox submits alongside the real statuses. It is not a
// ContainerStatus (it's a cross-prison relationship), so it is parsed out into its own boolean and sent
// to the API as dueForTransferIn rather than as a status.
export const TRANSFER_IN_FILTER_VALUE = 'DUE_FOR_TRANSFER_IN'

/**
 * Clears the search, the filters and what was remembered of them. Not a bare `/`, which means "restore what I
 * had" - see the establishment list route.
 */
export const CLEAR_FILTERS_HREF = '/?clear=1'

/**
 * prisoner-search reports these instead of a prison when someone is between places: TRN in transit, OUT once
 * released. Neither is an establishment, so neither can hold property.
 */
const NOT_AN_ESTABLISHMENT = ['TRN', 'OUT']

/** The prisoner's actual establishment, or null when they are not in one. */
const realPrisonId = (prisonId: string | null | undefined): string | null =>
  prisonId && !NOT_AN_ESTABLISHMENT.includes(prisonId) ? prisonId : null

/** The person-location labels, shared by the filter checkboxes and the applied-filter tags. */
export const PERSON_LOCATION_LABELS: Record<PersonLocation, string> = {
  IN_ESTABLISHMENT: 'In this establishment',
  LEFT_ESTABLISHMENT: 'No longer in this establishment',
}

export const isPrisonerNumber = (value: string): boolean => PRISON_NUMBER_PATTERN.test(value)

export const statusTag = containerStatusTag

// Incoming-property tags, shared by the establishment list and the person view so both read the same.
// "Due for transfer in": still held at the sending prison - its owner moved here but nobody has sent it
// yet. "In transit": the sending prison has transferred it out, but this prison has not yet logged its
// arrival (so it still needs storing here) - see isInTransitTo.
export const DUE_FOR_TRANSFER_IN_TAG = { text: 'Due for transfer in', classes: 'govuk-tag--turquoise' }
export const IN_TRANSIT_TAG = { text: 'In transit', classes: 'govuk-tag--blue' }

/**
 * Whether the container has been transferred out and is on its way to [viewedPrisonId] but not yet logged
 * there. The API clears `receivingPrisonId` once the receiving prison creates its own record (the transfer is
 * reconciled), so a populated one on a transferred-out container means it is still in flight.
 *
 * Being *addressed* here is not the only way it can be coming here. The address records where the sending
 * prison expected the person to go; if they were redirected, the box belongs wherever they actually are. So an
 * unreconciled transfer is also in transit to the prison now holding its owner - otherwise it is invisible at
 * the one prison that can receive it, while the prison named on the transfer lists it indefinitely.
 */
export const isInTransitTo = (container: PrisonerPropertyContainer, viewedPrisonId: string): boolean => {
  if (container.removalOutcome !== 'TRANSFERRED' || !container.receivingPrisonId) return false
  return (
    container.receivingPrisonId === viewedPrisonId || realPrisonId(container.prisonerCurrentPrisonId) === viewedPrisonId
  )
}

/**
 * The status tag for a container in the establishment list, relative to the viewed establishment. A
 * container physically held at another prison is due to be transferred *in* here (its owner was received
 * here), so it reads "Due for transfer in" rather than the API's viewer-independent "Due for transfer
 * out" - or "In transit" once the sending prison has actually sent it. Everything held here uses its
 * own status.
 */
export const establishmentListStatusTag = (
  container: PrisonerPropertyContainer,
  viewedPrisonId: string,
): { text: string; classes: string } => {
  if (isInTransitTo(container, viewedPrisonId)) return IN_TRANSIT_TAG
  if (container.prisonId !== viewedPrisonId) return DUE_FOR_TRANSFER_IN_TAG
  return statusTag(container.currentStatus)
}

export const containerTypeLabel = (type: ContainerType): string => CONTAINER_TYPE_LABELS[type] ?? type

export const containerLocation = (container: PrisonerPropertyContainer): string => {
  if (container.currentLocationType === 'BRANSTON') return 'Branston (offsite)'
  if (container.locationDescription) return container.locationDescription
  // Excess property with no internal location is held off-site at Branston (covers records created before the
  // BRANSTON location type was set); excess stored in a prison location falls through above to its location.
  if (container.containerType === 'EXCESS') return 'Branston (offsite)'
  return '-'
}

/**
 * A prisoner's current-establishment label that respects movement status. A prisoner mid-move has no
 * resolvable establishment name, so describe their movement instead: in transit -> "Transferring",
 * released -> "Released"; otherwise the current establishment name (or "Not known"). Shared by the
 * establishment list, the prisoner banner and the remove-container pages so all three agree.
 */
export const movementEstablishmentLabel = (
  movementStatus: PrisonerMovementStatus | null | undefined,
  currentPrisonName: string | null | undefined,
): string => {
  if (movementStatus === 'IN_TRANSIT') return 'Transferring'
  if (movementStatus === 'RELEASED') return 'Released'
  return currentPrisonName || 'Not known'
}

/** The "Establishment" column label for a group in the establishment-wide list. */
export const establishmentLabel = (group: PrisonerPropertyGroup): string =>
  movementEstablishmentLabel(group.prisonerMovementStatus, group.prisonerCurrentPrisonName)

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
  dueForTransferIn: boolean
  page: number
  apiQuery: PrisonPropertyListQuery
}

/** Parse and whitelist the establishment-list request query into filter + paging values. */
export const parsePropertyListQuery = (reqQuery: ParsedQs, size = DEFAULT_PAGE_SIZE): ParsedPropertyListQuery => {
  const search = firstValue(reqQuery.q) ?? ''
  const containerTypes = toArray(reqQuery.containerType).filter((type): type is ContainerType =>
    ALL_CONTAINER_TYPES.includes(type as ContainerType),
  )
  const rawStatuses = toArray(reqQuery.status)
  const statuses = rawStatuses.filter((status): status is ContainerStatus =>
    ALL_STATUSES.includes(status as ContainerStatus),
  )
  // The "Due for transfer in" checkbox shares the status group but isn't a real status - pull it out.
  const dueForTransferIn = rawStatuses.includes(TRANSFER_IN_FILTER_VALUE)
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
    dueForTransferIn: dueForTransferIn || undefined,
    page: page - 1, // API pages are zero-based
    size,
  }

  return { search, containerTypes, statuses, includeRemoved, personLocations, dueForTransferIn, page, apiQuery }
}

/**
 * Rebuild the canonical query string for a parsed list query - the inverse of [parsePropertyListQuery], and
 * built from the whitelisted values rather than the raw request, so anything unrecognised is dropped.
 *
 * Used for two things: the base of the pagination links (each of which appends its own page, hence the
 * default of leaving `page` out), and the value remembered in session so returning to the list restores what
 * the user was looking at (which does want the page). Keeping it in one place means the two cannot disagree
 * about the parameter names.
 *
 * Returns an empty string when nothing is filtered, which callers read as "nothing worth remembering".
 */
export const listQueryString = (
  parsed: ParsedPropertyListQuery,
  { includePage = false }: { includePage?: boolean } = {},
): string => {
  const params = new URLSearchParams()
  if (parsed.search) params.set('q', parsed.search)
  parsed.containerTypes.forEach(type => params.append('containerType', type))
  parsed.statuses.forEach(status => params.append('status', status))
  // "Due for transfer in" shares the status checkbox group, so it round-trips as a status value.
  if (parsed.dueForTransferIn) params.append('status', TRANSFER_IN_FILTER_VALUE)
  parsed.personLocations.forEach(location => params.append('personLocation', location))
  if (parsed.includeRemoved) params.set('includeRemoved', 'true')
  // Page 1 is the default, so recording it would only make the remembered query look filtered when it is not.
  if (includePage && parsed.page > 1) params.set('page', parsed.page.toString())
  return params.toString()
}

export interface AppliedFilterTag {
  text: string
  href: string
}

/**
 * The filters currently narrowing the list, as removable tags.
 *
 * The filters themselves sit inside a collapsed section, so without this nothing on screen says the list is
 * filtered at all - and since the filters now persist between visits, staff can arrive at a filtered list they
 * did not set up in this sitting and cannot see. The obvious failure is concluding property is missing when it
 * is only filtered out.
 *
 * Each label names its group, because the values do not speak for themselves out of context: "Standard" says
 * nothing about what it filters. Each href is the same list minus that one value, built from
 * [listQueryString] so the tags, the pagination links and the remembered query all agree about the parameter
 * names. The search term is deliberately absent - the search box is right above, already shows it, and has its
 * own clear link.
 *
 * Dropping the last filter links to the explicit clear, not to a bare list: a bare list means "restore what I
 * had", which would put back the filter just removed.
 */
export const appliedFilterTags = (parsed: ParsedPropertyListQuery): AppliedFilterTag[] => {
  const withoutIt = (without: Partial<ParsedPropertyListQuery>): string => {
    const query = listQueryString({ ...parsed, ...without, page: 1 })
    return query ? `/?${query}` : CLEAR_FILTERS_HREF
  }

  return [
    ...parsed.containerTypes.map(type => ({
      text: `Type: ${containerTypeLabel(type)}`,
      href: withoutIt({ containerTypes: parsed.containerTypes.filter(other => other !== type) }),
    })),
    ...parsed.statuses.map(status => ({
      text: `Status: ${statusTag(status).text}`,
      href: withoutIt({ statuses: parsed.statuses.filter(other => other !== status) }),
    })),
    // Not a real status - it rides along in the same parameter but is parsed out into its own flag, so
    // removing it means clearing the flag rather than filtering the status list.
    ...(parsed.dueForTransferIn
      ? [{ text: 'Status: Due for transfer in', href: withoutIt({ dueForTransferIn: false }) }]
      : []),
    ...parsed.personLocations.map(location => ({
      text: `People: ${PERSON_LOCATION_LABELS[location]}`,
      href: withoutIt({ personLocations: parsed.personLocations.filter(other => other !== location) }),
    })),
    ...(parsed.includeRemoved
      ? [{ text: 'Including removed property', href: withoutIt({ includeRemoved: false }) }]
      : []),
  ]
}

export interface PaginationItem {
  text?: number
  href?: string
  selected?: boolean
  type?: 'dots'
}

export interface Pagination {
  /** `text` is the noun the pagination component appends to the count, so it has to agree with it. */
  results: { from: number; to: number; count: number; text: string }
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
    results: { from, to, count: totalElements, text: totalElements === 1 ? 'result' : 'results' },
    previous: page > 1 ? { text: 'Previous', href: href(page - 1) } : undefined,
    next: page < totalPages ? { text: 'Next', href: href(page + 1) } : undefined,
    items,
  }
}

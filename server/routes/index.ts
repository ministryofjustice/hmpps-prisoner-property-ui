import { Router } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  buildPagination,
  containerLocation,
  containerTypeLabel,
  DEFAULT_PAGE_SIZE,
  isPrisonerNumber,
  parsePropertyListQuery,
  statusTag,
} from '../utils/propertyList'
import { buildPersonPropertyView } from '../utils/personProperty'
import { buildPrisonerBanner, fallbackPrisonerBanner } from '../utils/prisonerBanner'
import { buildPrisonerTimeline } from '../utils/prisonerTimeline'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import type { PrisonerPropertyContainer } from '../data/prisonerPropertyApiTypes'
import { toContainerBlocks, validateContainers, validateDetails } from '../utils/addContainer'
import { disposalBanner } from '../utils/changeContainer'
import {
  isRemoveReason,
  removalDateLabel,
  REMOVE_REASONS,
  removeResultStatus,
  resolveTransferTarget,
} from '../utils/removeContainer'
import config from '../config'
import logger from '../../logger'
import requireManageRole, { canManageProperty } from '../middleware/requireManageRole'
import requireAdminRole, { canAdminister } from '../middleware/requireAdminRole'

const BOX_PAGE_SIZE = 20

// The prisoner image placeholder shown when prison-api has no photo (or the call fails).
const PRISONER_IMAGE_PLACEHOLDER = '/assets/images/prisoner-image-withheld.svg'

export default function routes({
  auditService,
  prisonerPropertyService,
  prisonerService,
  userService,
}: Services): Router {
  const router = Router()

  router.get('/', async (req, res, _next) => {
    const { token, username } = res.locals.user

    const { activeCaseloadId } = await userService.getActiveCaseload(token)

    // Caseload protection: without an active caseload the user has no establishment to view, so we
    // show a guidance page and never call the property API. The list is always scoped to the user's
    // own active caseload, so they can only ever see data for an establishment they hold.
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    const { search, containerTypes, statuses, includeRemoved, personLocations, page, apiQuery } =
      parsePropertyListQuery(req.query, DEFAULT_PAGE_SIZE)

    // The summary counts come from a separate endpoint. Fetch it alongside the list, but degrade
    // gracefully: if it fails (e.g. the endpoint isn't deployed yet) render the list without the bar.
    const [result, summary] = await Promise.all([
      prisonerPropertyService.getPrisonProperty(activeCaseloadId, apiQuery, username),
      prisonerPropertyService.getPrisonPropertySummary(activeCaseloadId, username).catch((): null => null),
    ])

    await auditService.logPageView(Page.PROPERTY_LIST, {
      who: username,
      correlationId: req.id,
      details: { prisonId: activeCaseloadId },
    })

    const baseQueryParams = new URLSearchParams()
    if (search) baseQueryParams.set('q', search)
    containerTypes.forEach(type => baseQueryParams.append('containerType', type))
    statuses.forEach(status => baseQueryParams.append('status', status))
    personLocations.forEach(location => baseQueryParams.append('personLocation', location))
    if (includeRemoved) baseQueryParams.set('includeRemoved', 'true')

    return res.render('pages/propertyList', {
      canManage: canManageProperty(res.locals.user.userRoles),
      isAdmin: canAdminister(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      includeRemoved,
      summary,
      groups: result.content,
      pagination: buildPagination(
        page,
        result.totalPages,
        result.totalElements,
        result.size,
        baseQueryParams.toString(),
      ),
      search,
      containerTypeItems: ALL_CONTAINER_TYPES.map(type => ({
        value: type,
        text: containerTypeLabel(type),
        checked: containerTypes.includes(type),
      })),
      // "Due for transfer in" stays a disabled placeholder until the API models the receiving-prison view.
      statusItems: [
        {
          value: 'DUE_FOR_RETURN',
          text: statusTag('DUE_FOR_RETURN').text,
          checked: statuses.includes('DUE_FOR_RETURN'),
        },
        {
          value: 'DISPOSAL_REQUIRED',
          text: statusTag('DISPOSAL_REQUIRED').text,
          checked: statuses.includes('DISPOSAL_REQUIRED'),
        },
        {
          value: 'DUE_FOR_TRANSFER_OUT',
          text: statusTag('DUE_FOR_TRANSFER_OUT').text,
          checked: statuses.includes('DUE_FOR_TRANSFER_OUT'),
        },
        { value: 'TRANSFER_IN_PLACEHOLDER', text: 'Due for transfer in', disabled: true },
      ],
      personLocationItems: [
        {
          value: 'IN_ESTABLISHMENT',
          text: 'Property for people in this establishment',
          checked: personLocations.includes('IN_ESTABLISHMENT'),
        },
        {
          value: 'LEFT_ESTABLISHMENT',
          text: 'Property for people no longer in this establishment',
          checked: personLocations.includes('LEFT_ESTABLISHMENT'),
        },
      ],
    })
  })

  router.get('/prisoner/:prisonerNumber', async (req, res, next) => {
    const { token, username } = res.locals.user
    const { prisonerNumber } = req.params

    // Caseload protection: a user without an active caseload has no establishment context, so they
    // shouldn't reach person-level property. Consistent with the establishment list guard.
    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // Fetch property and prisoner details together. Prisoner-search feeds the banner but is not
    // essential to the page, so a failure there falls back to a minimal banner rather than 500ing.
    const [containers, prisoner] = await Promise.all([
      prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username),
      prisonerService.getPrisonerDetails(prisonerNumber, username).catch((error: Error): Prisoner | null => {
        logger.warn(`Failed to load prisoner-search details for ${prisonerNumber}: ${error.message}`)
        return null
      }),
    ])

    await auditService.logPageView(Page.PRISONER_PROPERTY, {
      who: username,
      subjectId: prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
    })

    const { inEstablishment, dueToTransferIn, hasLeft, prisonerCurrentPrisonName } = buildPersonPropertyView(
      containers,
      activeCaseloadId,
    )

    const banner = prisoner
      ? buildPrisonerBanner(prisonerNumber, prisoner, activeCaseloadId)
      : fallbackPrisonerBanner(prisonerNumber, containers[0]?.prisonerName ?? null)

    return res.render('pages/prisonerProperty', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      prisonerCurrentPrisonName,
      hasLeft,
      banner,
      inEstablishment,
      dueToTransferIn,
      canManage: canManageProperty(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      errorMessage: req.flash('error')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/history', async (req, res, next) => {
    const { token, username } = res.locals.user
    const { prisonerNumber } = req.params

    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // The timeline is the tab's own data; the property list is fetched only for the shared header
    // (name + banner fallback), and prisoner-search feeds the banner but is not essential to the page.
    const [timelineItems, containers, prisoner] = await Promise.all([
      prisonerPropertyService.getPrisonerPropertyHistory(prisonerNumber, username),
      prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username),
      prisonerService.getPrisonerDetails(prisonerNumber, username).catch((error: Error): Prisoner | null => {
        logger.warn(`Failed to load prisoner-search details for ${prisonerNumber}: ${error.message}`)
        return null
      }),
    ])

    await auditService.logPageView(Page.PRISONER_PROPERTY_HISTORY, {
      who: username,
      subjectId: prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
    })

    const banner = prisoner
      ? buildPrisonerBanner(prisonerNumber, prisoner, activeCaseloadId)
      : fallbackPrisonerBanner(prisonerNumber, containers[0]?.prisonerName ?? null)

    const nameByUsername = await userService.getUserDisplayNames(
      timelineItems.map(item => item.eventUserId),
      username,
    )

    return res.render('pages/prisonerPropertyHistory', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      banner,
      timeline: buildPrisonerTimeline(timelineItems, prisonerNumber, nameByUsername),
      migrationDate: config.nomisMigrationDate,
      canManage: canManageProperty(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/image', async (req, res, next) => {
    const { username } = res.locals.user
    const { prisonerNumber } = req.params

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // Proxy the prisoner's photo from prison-api. When there is no image (or the call fails) redirect
    // to the "Photo withheld for security reasons" placeholder so the banner always renders.
    try {
      const image = await prisonerService.getPrisonerImage(prisonerNumber, username)
      res.type('image/jpeg')
      res.set('Cache-Control', 'private, max-age=300')
      return image.pipe(res)
    } catch (error) {
      logger.warn(`Failed to load prisoner image for ${prisonerNumber}: ${error.message}`)
      return res.redirect(PRISONER_IMAGE_PLACEHOLDER)
    }
  })

  router.get('/prisoner/:prisonerNumber/container/:id', async (req, res, next) => {
    const { token, username } = res.locals.user
    const { prisonerNumber, id } = req.params

    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // Resolve the container from the prisoner's own property so the URL is coherent (the container
    // belongs to this prisoner) and we have its details for the page heading. 404 otherwise.
    const containers = await prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username)
    const container = containers.find(c => c.id === id)
    if (!container) {
      return next(createError(404, 'Property container not found'))
    }

    const events = await prisonerPropertyService.getContainerEvents(id, username)

    await auditService.logPageView(Page.CONTAINER_HISTORY, {
      who: username,
      subjectId: prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
      details: { containerId: id },
    })

    const nameByUsername = await userService.getUserDisplayNames(
      events.map(event => event.eventUserId),
      username,
    )

    return res.render('pages/containerHistory', {
      prisonerNumber,
      prisonerName: container.prisonerName,
      container,
      events,
      userNames: Object.fromEntries(nameByUsername),
      backUrl: `/prisoner/${prisonerNumber}`,
    })
  })

  // ---- Add property container(s) journey: search for a person, then add one or more (manage role) ----

  interface JourneyContext {
    prisonerNumber: string
    activeCaseloadId: string
    activeCaseloadName: string | null
  }

  // Shared guard for every journey step: require an active caseload and a valid prisoner number.
  // Returns null (after responding) when the caller should stop.
  const resolveContext = async (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
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

  const isoToParts = (iso?: string): { day: string; month: string; year: string } => {
    if (!iso) return { day: '', month: '', year: '' }
    const [year, month, day] = iso.split('-')
    return { day: String(Number(day)), month: String(Number(month)), year: year ?? '' }
  }

  type AddContainerJourney = NonNullable<import('express-session').SessionData['addContainerJourney']>
  type AddContainerDraft = AddContainerJourney['containers'][number]

  // The index of the next container that still needs a storage location (non-Excess, none picked yet),
  // from `from` onwards; -1 when they all have one (or are Excess/offsite).
  const nextLocationIndex = (containers: AddContainerDraft[], from: number): number =>
    containers.findIndex((c, i) => i >= from && c.containerType !== 'EXCESS' && !c.internalLocationId)

  // The prisoner's display name, from their property if any, else prisoner-search (zero-property people
  // reached via the search entry have no property yet). Null if it can't be resolved.
  const resolvePrisonerName = async (prisonerNumber: string, username: string): Promise<string | null> => {
    const property = await prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username)
    if (property[0]?.prisonerName) return property[0].prisonerName
    try {
      const prisoner = await prisonerService.getPrisonerDetails(prisonerNumber, username)
      return [prisoner.firstName, prisoner.lastName].filter(Boolean).join(' ') || null
    } catch {
      return null
    }
  }

  // The raw view model for a stored draft (disposal date split into date-input parts).
  const draftToView = (c: AddContainerDraft) => ({
    sealNumber: c.sealNumber ?? '',
    previousSealNumber: c.previousSealNumber ?? '',
    containerType: c.containerType,
    disposalDate: isoToParts(c.proposedDisposalDate),
  })

  const renderAddDetails = async (
    req: import('express').Request,
    res: import('express').Response,
    ctx: JourneyContext,
    origin: 'list' | 'person',
    containers: unknown[],
    errorList: { text: string; href: string }[] = [],
  ) => {
    const { username } = res.locals.user
    return res.render('pages/addContainer/details', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: await resolvePrisonerName(ctx.prisonerNumber, username),
      establishmentName: ctx.activeCaseloadName,
      containers,
      containerTypes: ALL_CONTAINER_TYPES.map(type => ({ value: type, text: containerTypeLabel(type) })),
      errorList,
      // Per-field messages keyed by input id (e.g. containers-0-sealNumber), for inline display.
      fieldErrors: Object.fromEntries(errorList.map(e => [e.href.slice(1), e.text])),
      errorBanner: req.flash('error')[0],
      backUrl: origin === 'list' ? '/add-container' : `/prisoner/${ctx.prisonerNumber}`,
    })
  }

  // Entry point 1 (establishment list): search for the person to add property for.
  router.get('/add-container', requireManageRole, async (req, res) => {
    const { token, username } = res.locals.user
    const { activeCaseloadId, activeCaseloadName } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) return res.render('pages/noCaseload')

    const term = String(req.query.q ?? '').trim()
    const searched = req.query.q !== undefined
    const parsedPage = Number.parseInt((req.query.page as string) ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    let results = null
    let errorMessage
    if (searched && !term) {
      errorMessage = 'Enter a name or prison number'
    } else if (searched) {
      // Scoped to the user's own caseload - never a global search.
      const found = await prisonerService.searchPrisoners(term, activeCaseloadId, page - 1, DEFAULT_PAGE_SIZE, username)
      const baseQuery = new URLSearchParams({ q: term })
      results = {
        prisoners: found.content,
        pagination: buildPagination(page, found.totalPages, found.totalElements, found.size, baseQuery.toString()),
      }
    }

    return res.render('pages/addContainer/search', {
      establishmentName: activeCaseloadName,
      term,
      results,
      errorMessage,
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/add-container', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const origin = req.query.from === 'list' ? 'list' : 'person'
    req.session.addContainerJourney = { prisonerNumber: ctx.prisonerNumber, origin, containers: [{}] }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
  })

  router.get('/prisoner/:prisonerNumber/add-container/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container`)
    }
    return renderAddDetails(req, res, ctx, journey.origin, journey.containers.map(draftToView))
  })

  router.post('/prisoner/:prisonerNumber/add-container/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container`)
    }

    const blocks = toContainerBlocks(req.body.containers)

    // "Add another": keep what's entered and append an empty block; no validation yet.
    if (req.body.action === 'addAnother') {
      return renderAddDetails(req, res, ctx, journey.origin, [...blocks, {}])
    }

    const { values, errors } = validateContainers(blocks)
    if (!values) {
      return renderAddDetails(req, res, ctx, journey.origin, blocks, errors)
    }

    // Keep any location already chosen for a container at the same index (editing from Check your
    // answers), unless it is now Excess (off-site Branston, never gets an internal location).
    const containers: AddContainerDraft[] = values.map((v, i) => {
      const previous = journey.containers[i]
      const keepLocation = v.containerType !== 'EXCESS' && previous?.internalLocationId
      return {
        sealNumber: v.sealNumber,
        previousSealNumber: v.previousSealNumber,
        containerType: v.containerType,
        proposedDisposalDate: v.proposedDisposalDate,
        internalLocationId: keepLocation ? previous.internalLocationId : undefined,
        locationName: keepLocation ? previous.locationName : undefined,
      }
    })
    req.session.addContainerJourney = { ...journey, containers }

    const index = nextLocationIndex(containers, 0)
    return res.redirect(
      index === -1
        ? `/prisoner/${ctx.prisonerNumber}/add-container/check`
        : `/prisoner/${ctx.prisonerNumber}/add-container/location/${index}`,
    )
  })

  router.get('/prisoner/:prisonerNumber/add-container/location/:index', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    const index = Number.parseInt(String(req.params.index), 10)
    const draft = journey?.containers?.[index]
    if (journey?.prisonerNumber !== ctx.prisonerNumber || !draft?.sealNumber || !draft?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }

    const { username } = res.locals.user
    const rawQuery = req.query.query
    const query = String(rawQuery ?? '').trim() || undefined
    const searchError = rawQuery !== undefined && !query // Search clicked with an empty box
    const parsedPage = Number.parseInt((req.query.page as string) ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const result = await prisonerPropertyService.getBoxLocations(
      ctx.activeCaseloadId,
      { query, page: page - 1, size: BOX_PAGE_SIZE },
      username,
    )

    const baseQuery = new URLSearchParams()
    if (query) baseQuery.set('query', query)

    return res.render('pages/addContainer/location', {
      prisonerNumber: ctx.prisonerNumber,
      sealNumber: draft.sealNumber,
      query: query ?? '',
      locations: result.content,
      pagination: buildPagination(page, result.totalPages, result.totalElements, result.size, baseQuery.toString()),
      searchError,
      errorBanner: req.flash('error')[0],
      backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/details`,
    })
  })

  router.post('/prisoner/:prisonerNumber/add-container/location/:index', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    const index = Number.parseInt(String(req.params.index), 10)
    if (journey?.prisonerNumber !== ctx.prisonerNumber || !journey.containers[index]) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }

    journey.containers[index] = {
      ...journey.containers[index],
      internalLocationId: req.body.internalLocationId,
      locationName: req.body.locationName,
    }
    req.session.addContainerJourney = journey

    const nextIndex = nextLocationIndex(journey.containers, index + 1)
    return res.redirect(
      nextIndex === -1
        ? `/prisoner/${ctx.prisonerNumber}/add-container/check`
        : `/prisoner/${ctx.prisonerNumber}/add-container/location/${nextIndex}`,
    )
  })

  router.get('/prisoner/:prisonerNumber/add-container/check', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber || !journey.containers.length) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }
    if (journey.containers.some(c => !c.sealNumber || !c.containerType)) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }
    const missing = nextLocationIndex(journey.containers, 0)
    if (missing !== -1) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/location/${missing}`)
    }

    const { username } = res.locals.user
    return res.render('pages/addContainer/checkAnswers', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: await resolvePrisonerName(ctx.prisonerNumber, username),
      establishmentName: ctx.activeCaseloadName,
      containers: journey.containers.map((c, index) => ({
        index,
        sealNumber: c.sealNumber,
        containerType: c.containerType,
        proposedDisposalDate: c.proposedDisposalDate,
        storageLocation: c.containerType === 'EXCESS' ? 'Branston (offsite)' : c.locationName,
      })),
      backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/details`,
    })
  })

  router.post('/prisoner/:prisonerNumber/add-container/confirm', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber || !journey.containers.length) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }

    const { username } = res.locals.user
    try {
      // Sequential so seal-uniqueness is enforced deterministically and the first failure is surfaced.
      for (const c of journey.containers) {
        // eslint-disable-next-line no-await-in-loop
        await prisonerPropertyService.createContainer(
          {
            prisonerNumber: ctx.prisonerNumber,
            prisonId: ctx.activeCaseloadId,
            containerType: c.containerType!,
            sealNumber: c.sealNumber!,
            previousSealNumber: c.previousSealNumber,
            internalLocationId: c.containerType === 'EXCESS' ? undefined : c.internalLocationId,
            proposedDisposalDate: c.proposedDisposalDate,
          },
          username,
        )
      }
    } catch (error) {
      const status = (error as { responseStatus?: number }).responseStatus
      if (status === 409) {
        req.flash('error', 'A property container with this seal number already exists. Enter a different seal number.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
      }
      if (status === 400) {
        req.flash('error', 'A storage location could not be used. Check the containers and try again.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
      }
      return next(error)
    }

    await auditService.logPageView(Page.ADD_PROPERTY_CONTAINER, {
      who: username,
      subjectId: ctx.prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
      details: { count: journey.containers.length },
    })

    const { origin } = journey
    req.session.addContainerJourney = undefined
    req.flash('success', 'Property container(s) added')
    return res.redirect(origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`)
  })

  // ---- Remove a property container journey (gated on the manage role) ----

  // Resolve the container from the prisoner's own active property so the URL is coherent (it belongs to
  // this prisoner) and we have its enriched details for the screens. Returns null when it is not found
  // or has already been removed, so the caller can 404.
  const loadRemovableContainer = async (
    prisonerNumber: string,
    id: string,
    username: string,
  ): Promise<PrisonerPropertyContainer | null> => {
    const containers = await prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username)
    const container = containers.find(c => c.id === id)
    if (!container || container.removalOutcome) return null
    return container
  }

  const removeBackUrl = (ctx: JourneyContext, origin: 'list' | 'person'): string =>
    origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`

  const renderRemoveReason = (
    res: import('express').Response,
    ctx: JourneyContext,
    container: PrisonerPropertyContainer,
    origin: 'list' | 'person',
    options: { selected?: string; errorList?: { text: string; href: string }[]; errorBanner?: string } = {},
  ) =>
    res.render('pages/removeContainer/reason', {
      prisonerNumber: ctx.prisonerNumber,
      container,
      prisonerName: container.prisonerName,
      prisonerEstablishment: container.prisonerCurrentPrisonName || container.prisonName || null,
      status: statusTag(container.currentStatus),
      reasons: REMOVE_REASONS.map(reason => ({
        value: reason.value,
        text: reason.text,
        hint: { text: reason.hint },
        checked: reason.value === options.selected,
      })),
      errorList: options.errorList ?? [],
      errorBanner: options.errorBanner,
      backUrl: removeBackUrl(ctx, origin),
    })

  router.get('/prisoner/:prisonerNumber/remove-container/:id', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    const origin = req.query.from === 'list' ? 'list' : 'person'
    req.session.removeContainerJourney = { prisonerNumber: ctx.prisonerNumber, containerId: id, origin }
    return renderRemoveReason(res, ctx, container, origin, { errorBanner: req.flash('error')[0] })
  })

  router.post('/prisoner/:prisonerNumber/remove-container/:id', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const origin = req.session.removeContainerJourney?.origin ?? 'person'

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    const { outcome } = req.body
    if (!isRemoveReason(outcome)) {
      return renderRemoveReason(res, ctx, container, origin, {
        errorList: [{ text: 'Select why you are removing this property container record', href: '#outcome' }],
      })
    }

    const target = outcome === 'TRANSFERRED' ? resolveTransferTarget(container, ctx.activeCaseloadId) : null
    req.session.removeContainerJourney = {
      prisonerNumber: ctx.prisonerNumber,
      containerId: id,
      origin,
      outcome,
      toPrisonId: target?.toPrisonId ?? undefined,
    }

    if (target?.needsInterruption) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}/interruption`)
    }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}/check`)
  })

  router.get(
    '/prisoner/:prisonerNumber/remove-container/:id/interruption',
    requireManageRole,
    async (req, res, next) => {
      const ctx = await resolveContext(req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)
      const journey = req.session.removeContainerJourney

      if (journey?.containerId !== id || journey?.outcome !== 'TRANSFERRED') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
      }

      const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
      if (!container) return next(createError(404, 'Property container not found'))

      const target = resolveTransferTarget(container, ctx.activeCaseloadId)
      return res.render('pages/removeContainer/interruption', {
        prisonerNumber: ctx.prisonerNumber,
        prisonerName: container.prisonerName,
        establishmentName: target.toPrisonName || 'their new establishment',
        continueUrl: `/prisoner/${ctx.prisonerNumber}/remove-container/${id}/check`,
        backUrl: `/prisoner/${ctx.prisonerNumber}/remove-container/${id}`,
      })
    },
  )

  router.get('/prisoner/:prisonerNumber/remove-container/:id/check', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const journey = req.session.removeContainerJourney

    if (journey?.containerId !== id || !journey?.outcome) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
    }

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    return res.render('pages/removeContainer/checkAnswers', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: container.prisonerName,
      prisonerEstablishment: container.prisonerCurrentPrisonName || container.prisonName || null,
      container,
      outcome: journey.outcome,
      resultStatus: removeResultStatus(journey.outcome),
      removalDateLabel: removalDateLabel(journey.outcome),
      removalDate: new Date().toISOString().slice(0, 10),
      backUrl: `/prisoner/${ctx.prisonerNumber}/remove-container/${id}`,
    })
  })

  router.post('/prisoner/:prisonerNumber/remove-container/:id/confirm', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const journey = req.session.removeContainerJourney

    if (journey?.containerId !== id || !journey?.outcome) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
    }

    // A transfer must reassign the container to a known receiving prison that differs from this one. If
    // prisoner-search never settled a different destination, we cannot transfer - send the user back to
    // pick another reason.
    if (journey.outcome === 'TRANSFERRED' && (!journey.toPrisonId || journey.toPrisonId === ctx.activeCaseloadId)) {
      req.flash(
        'error',
        'The prisoner’s new establishment is not known yet, so this container cannot be transferred. Choose another reason or try again once their move is recorded.',
      )
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
    }

    try {
      await prisonerPropertyService.removeContainer(
        id,
        { outcome: journey.outcome, toPrisonId: journey.outcome === 'TRANSFERRED' ? journey.toPrisonId : undefined },
        username,
      )
    } catch (error) {
      const status = (error as { responseStatus?: number }).responseStatus
      if (status === 409) {
        req.flash('error', 'This property container has already been removed.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
      }
      return next(error)
    }

    await auditService.logPageView(Page.REMOVE_PROPERTY_CONTAINER, {
      who: username,
      subjectId: ctx.prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
      details: { containerId: id, outcome: journey.outcome },
    })

    const { origin } = journey
    req.session.removeContainerJourney = undefined
    req.flash('success', 'Property container removed')
    return res.redirect(origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`)
  })

  // ---- Combine property containers journey (person view, gated on the manage role) ----

  // The selected sources with their person-view status tag, in the order they were chosen. Rebuilt from
  // the prisoner's current property so the display (and its status) stays authoritative.
  const combineSourceRows = async (ctx: JourneyContext, ids: string[], username: string) => {
    const containers = await prisonerPropertyService.getPropertyForPrisoner(ctx.prisonerNumber, username)
    const { inEstablishment } = buildPersonPropertyView(containers, ctx.activeCaseloadId)
    const byId = new Map(inEstablishment.map(row => [row.container.id, row]))
    return { containers, sources: ids.map(id => byId.get(id)).filter(Boolean) as typeof inEstablishment }
  }

  const renderCombineDetails = async (
    req: import('express').Request,
    res: import('express').Response,
    ctx: JourneyContext,
    journey: NonNullable<import('express-session').SessionData['combineJourney']>,
    data: Record<string, unknown>,
    errors: Record<string, { text: string; href: string }> = {},
  ) => {
    const { username } = res.locals.user
    const { containers, sources } = await combineSourceRows(ctx, journey.sourceContainerIds, username)
    return res.render('pages/combine/details', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      establishmentName: ctx.activeCaseloadName,
      sources,
      data,
      containerTypes: ALL_CONTAINER_TYPES.map(type => ({
        value: type,
        text: containerTypeLabel(type),
        checked: type === data.containerType,
      })),
      errors,
      errorList: Object.values(errors),
      errorBanner: req.flash('error')[0],
      backUrl: `/prisoner/${ctx.prisonerNumber}`,
    })
  }

  router.post('/prisoner/:prisonerNumber/combine', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user

    // Keep only ticked ids that are this prisoner's active containers held in the viewed prison - the
    // API requires the sources to share one prisoner + prison and be active.
    const ticked = ([] as string[]).concat((req.body.containerIds as string | string[]) ?? []).map(String)
    const containers = await prisonerPropertyService.getPropertyForPrisoner(ctx.prisonerNumber, username)
    const selectable = new Set(
      containers.filter(c => !c.removalOutcome && c.prisonId === ctx.activeCaseloadId).map(c => c.id),
    )
    const sourceContainerIds = ticked.filter(id => selectable.has(id))

    if (sourceContainerIds.length < 2) {
      req.flash('error', 'Select two or more property containers to combine.')
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    }

    req.session.combineJourney = { prisonerNumber: ctx.prisonerNumber, sourceContainerIds }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
  })

  router.get('/prisoner/:prisonerNumber/combine/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber || journey.sourceContainerIds.length < 2) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    }
    return renderCombineDetails(req, res, ctx, journey, {
      sealNumber: journey.sealNumber,
      containerType: journey.containerType,
      ...isoToParts(journey.proposedDisposalDate),
    })
  })

  router.post('/prisoner/:prisonerNumber/combine/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (journey?.prisonerNumber !== ctx.prisonerNumber || journey.sourceContainerIds.length < 2) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    }

    const { values, errors } = validateDetails(req.body)
    if (!values) {
      return renderCombineDetails(
        req,
        res,
        ctx,
        journey,
        {
          sealNumber: req.body.sealNumber,
          containerType: req.body.containerType,
          day: req.body['disposalDate-day'],
          month: req.body['disposalDate-month'],
          year: req.body['disposalDate-year'],
        },
        errors,
      )
    }

    // Excess property is stored off-site at Branston, so there is no internal storage-location step.
    const excess = values.containerType === 'EXCESS'
    req.session.combineJourney = {
      ...journey,
      sealNumber: values.sealNumber,
      containerType: values.containerType,
      proposedDisposalDate: values.proposedDisposalDate,
      locationType: excess ? 'BRANSTON' : 'INTERNAL',
      internalLocationId: excess ? undefined : journey.internalLocationId,
      locationName: excess ? undefined : journey.locationName,
    }

    if (excess) return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/check`)
    // If a location was already chosen (editing details from Check your answers) return to CYA.
    const next2 = req.session.combineJourney.internalLocationId ? 'check' : 'location'
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/${next2}`)
  })

  router.get('/prisoner/:prisonerNumber/combine/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
    }

    const { username } = res.locals.user
    const query = (req.query.query as string)?.trim() || undefined
    const parsedPage = Number.parseInt((req.query.page as string) ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const result = await prisonerPropertyService.getBoxLocations(
      ctx.activeCaseloadId,
      { query, page: page - 1, size: BOX_PAGE_SIZE },
      username,
    )

    const baseQuery = new URLSearchParams()
    if (query) baseQuery.set('query', query)

    return res.render('pages/addContainer/location', {
      prisonerNumber: ctx.prisonerNumber,
      sealNumber: journey.sealNumber,
      query: query ?? '',
      locations: result.content,
      pagination: buildPagination(page, result.totalPages, result.totalElements, result.size, baseQuery.toString()),
      errorBanner: req.flash('error')[0],
      backUrl: `/prisoner/${ctx.prisonerNumber}/combine/details`,
    })
  })

  router.post('/prisoner/:prisonerNumber/combine/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
    }
    req.session.combineJourney = {
      ...journey,
      locationType: 'INTERNAL',
      internalLocationId: req.body.internalLocationId,
      locationName: req.body.locationName,
    }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/check`)
  })

  router.get('/prisoner/:prisonerNumber/combine/check', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
    }
    if (journey.locationType === 'INTERNAL' && !journey.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/location`)
    }

    const { username } = res.locals.user
    const { containers, sources } = await combineSourceRows(ctx, journey.sourceContainerIds, username)
    const branston = journey.locationType === 'BRANSTON'
    return res.render('pages/combine/checkAnswers', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      establishmentName: ctx.activeCaseloadName,
      sources,
      journey,
      storageLocation: branston ? 'Branston (offsite)' : journey.locationName,
      backUrl: branston
        ? `/prisoner/${ctx.prisonerNumber}/combine/details`
        : `/prisoner/${ctx.prisonerNumber}/combine/location`,
    })
  })

  router.post('/prisoner/:prisonerNumber/combine/confirm', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.combineJourney
    if (!journey?.sealNumber || !journey?.containerType || journey.sourceContainerIds.length < 2) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    }
    if (journey.locationType === 'INTERNAL' && !journey.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/location`)
    }

    const { username } = res.locals.user
    try {
      const created = await prisonerPropertyService.combineContainers(
        {
          sourceContainerIds: journey.sourceContainerIds,
          containerType: journey.containerType,
          sealNumber: journey.sealNumber,
          internalLocationId: journey.locationType === 'INTERNAL' ? journey.internalLocationId : undefined,
          locationType: journey.locationType,
        },
        username,
      )

      await auditService.logPageView(Page.COMBINE_PROPERTY_CONTAINERS, {
        who: username,
        subjectId: ctx.prisonerNumber,
        subjectType: 'PRISONER_NUMBER',
        correlationId: req.id,
        details: { containerId: created.id, sourceContainerIds: journey.sourceContainerIds },
      })

      req.session.combineJourney = undefined
      req.flash('success', 'Property containers combined')
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    } catch (error) {
      const status = (error as { responseStatus?: number }).responseStatus
      if (status === 409) {
        req.flash('error', 'A property container with this seal number already exists. Enter a different seal number.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
      }
      if (status === 400) {
        req.flash('error', 'That storage location could not be used. Select a different location.')
        const step = journey.locationType === 'BRANSTON' ? 'details' : 'location'
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/${step}`)
      }
      return next(error)
    }
  })

  // ---- Change a property container journey (gated on the manage role) ----

  const renderChangeDetails = async (
    req: import('express').Request,
    res: import('express').Response,
    ctx: JourneyContext,
    container: PrisonerPropertyContainer,
    journey: NonNullable<import('express-session').SessionData['changeContainerJourney']>,
    data: Record<string, unknown>,
    errors: Record<string, { text: string; href: string }> = {},
  ) =>
    res.render('pages/changeContainer/details', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: container.prisonerName,
      prisonerEstablishment: container.prisonerCurrentPrisonName || container.prisonName || null,
      status: statusTag(container.currentStatus),
      container,
      hasCurrentLocation: container.currentLocationType != null,
      currentLocationName: containerLocation(container),
      disposal: disposalBanner(container.proposedDisposalDate),
      removeUrl: `/prisoner/${ctx.prisonerNumber}/remove-container/${container.id}?from=${journey.origin}`,
      data,
      containerTypes: ALL_CONTAINER_TYPES.map(type => ({
        value: type,
        text: containerTypeLabel(type),
        checked: type === data.containerType,
      })),
      errors,
      errorList: Object.values(errors),
      errorBanner: req.flash('error')[0],
      backUrl: journey.origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`,
    })

  router.get('/prisoner/:prisonerNumber/change-container/:id', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    const origin = req.query.from === 'list' ? 'list' : 'person'
    req.session.changeContainerJourney = {
      prisonerNumber: ctx.prisonerNumber,
      containerId: id,
      origin,
      sealNumber: container.currentSealNumber ?? undefined,
      containerType: container.containerType,
      proposedDisposalDate: container.proposedDisposalDate ?? undefined,
      locationChoice: 'current',
    }
    return renderChangeDetails(req, res, ctx, container, req.session.changeContainerJourney, {
      sealNumber: container.currentSealNumber,
      containerType: container.containerType,
      locationChoice: 'current',
      ...isoToParts(container.proposedDisposalDate ?? undefined),
    })
  })

  router.post('/prisoner/:prisonerNumber/change-container/:id', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const journey = req.session.changeContainerJourney
    if (journey?.containerId !== id) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}`)
    }

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    const { values, errors } = validateDetails(req.body)
    if (!values) {
      return renderChangeDetails(
        req,
        res,
        ctx,
        container,
        journey,
        {
          sealNumber: req.body.sealNumber,
          containerType: req.body.containerType,
          locationChoice: req.body.locationChoice,
          day: req.body['disposalDate-day'],
          month: req.body['disposalDate-month'],
          year: req.body['disposalDate-year'],
        },
        errors,
      )
    }

    const locationChoice = req.body.locationChoice === 'new' ? 'new' : 'current'
    req.session.changeContainerJourney = {
      ...journey,
      sealNumber: values.sealNumber,
      containerType: values.containerType,
      proposedDisposalDate: values.proposedDisposalDate,
      locationChoice,
      internalLocationId: locationChoice === 'new' ? journey.internalLocationId : undefined,
      locationName: locationChoice === 'new' ? journey.locationName : undefined,
    }

    // Keep-current, or picking a new location we already chose (editing from CYA), go straight to CYA.
    if (locationChoice === 'current' || req.session.changeContainerJourney.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}/check`)
    }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}/location`)
  })

  router.get('/prisoner/:prisonerNumber/change-container/:id/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.changeContainerJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${String(req.params.id)}`)
    }

    const { username } = res.locals.user
    const query = (req.query.query as string)?.trim() || undefined
    const parsedPage = Number.parseInt((req.query.page as string) ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const result = await prisonerPropertyService.getBoxLocations(
      ctx.activeCaseloadId,
      { query, page: page - 1, size: BOX_PAGE_SIZE },
      username,
    )

    const baseQuery = new URLSearchParams()
    if (query) baseQuery.set('query', query)

    return res.render('pages/addContainer/location', {
      prisonerNumber: ctx.prisonerNumber,
      sealNumber: journey.sealNumber,
      query: query ?? '',
      locations: result.content,
      pagination: buildPagination(page, result.totalPages, result.totalElements, result.size, baseQuery.toString()),
      errorBanner: req.flash('error')[0],
      backUrl: `/prisoner/${ctx.prisonerNumber}/change-container/${journey.containerId}`,
    })
  })

  router.post('/prisoner/:prisonerNumber/change-container/:id/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.changeContainerJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${String(req.params.id)}`)
    }
    req.session.changeContainerJourney = {
      ...journey,
      locationChoice: 'new',
      internalLocationId: req.body.internalLocationId,
      locationName: req.body.locationName,
    }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${journey.containerId}/check`)
  })

  router.get('/prisoner/:prisonerNumber/change-container/:id/check', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const journey = req.session.changeContainerJourney
    if (journey?.containerId !== id || !journey.sealNumber || !journey.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}`)
    }
    if (journey.locationChoice === 'new' && !journey.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}/location`)
    }

    const container = await loadRemovableContainer(ctx.prisonerNumber, id, username)
    if (!container) return next(createError(404, 'Property container not found'))

    return res.render('pages/changeContainer/checkAnswers', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: container.prisonerName,
      prisonerEstablishment: container.prisonerCurrentPrisonName || container.prisonName || null,
      status: statusTag(container.currentStatus),
      journey,
      storageLocation: journey.locationChoice === 'new' ? journey.locationName : containerLocation(container),
      backUrl: `/prisoner/${ctx.prisonerNumber}/change-container/${id}`,
    })
  })

  router.post('/prisoner/:prisonerNumber/change-container/:id/confirm', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const { username } = res.locals.user
    const id = String(req.params.id)
    const journey = req.session.changeContainerJourney
    if (journey?.containerId !== id || !journey.sealNumber || !journey.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}`)
    }

    try {
      await prisonerPropertyService.updateContainer(
        id,
        {
          containerType: journey.containerType,
          sealNumber: journey.sealNumber,
          internalLocationId: journey.locationChoice === 'new' ? journey.internalLocationId : undefined,
          proposedDisposalDate: journey.proposedDisposalDate,
        },
        username,
      )
    } catch (error) {
      const status = (error as { responseStatus?: number }).responseStatus
      if (status === 409) {
        req.flash('error', 'A property container with this seal number already exists. Enter a different seal number.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}`)
      }
      if (status === 400) {
        req.flash('error', 'That storage location could not be used. Select a different location.')
        const step = journey.locationChoice === 'new' ? 'location' : ''
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}${step ? `/${step}` : ''}`)
      }
      return next(error)
    }

    await auditService.logPageView(Page.CHANGE_PROPERTY_CONTAINER, {
      who: username,
      subjectId: ctx.prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
      details: { containerId: id },
    })

    const { origin } = journey
    req.session.changeContainerJourney = undefined
    req.flash('success', 'Property container updated')
    return res.redirect(origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`)
  })

  // Admin console: switch the property service on/off per prison. Not caseload-scoped - it is a
  // national rollout control gated on the admin role.
  router.get('/admin/prisons', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    const agencies = await prisonerPropertyService.getAllAgencies(username)
    const needle = search.toLowerCase()
    const filtered = needle
      ? agencies.filter(
          agency => agency.name.toLowerCase().includes(needle) || agency.agencyId.toLowerCase().includes(needle),
        )
      : agencies

    await auditService.logPageView(Page.ADMIN_PRISONS, { who: username, correlationId: req.id })

    return res.render('pages/admin/prisons', {
      agencies: filtered,
      search,
      activeCount: agencies.filter(agency => agency.active).length,
      totalCount: agencies.length,
      successMessage: req.flash('success')[0],
    })
  })

  router.post('/admin/prisons/:agencyId', requireAdminRole, async (req, res) => {
    const { username } = res.locals.user
    const agencyId = String(req.params.agencyId)
    const active = req.body.active === 'true'
    const name = typeof req.body.name === 'string' && req.body.name ? req.body.name : agencyId

    await prisonerPropertyService.setAgencyActive(agencyId, active, username)
    req.flash('success', `Property is now switched ${active ? 'on' : 'off'} for ${name}.`)

    const params = new URLSearchParams()
    if (typeof req.body.q === 'string' && req.body.q) params.set('q', req.body.q)
    const query = params.toString()
    return res.redirect(`/admin/prisons${query ? `?${query}` : ''}`)
  })

  return router
}

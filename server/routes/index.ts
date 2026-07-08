import { Router } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  buildPagination,
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
import { validateDetails } from '../utils/addContainer'
import config from '../config'
import logger from '../../logger'
import requireManageRole, { canManageProperty } from '../middleware/requireManageRole'

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

    const { activeCaseloadId, activeCaseloadName } = await userService.getActiveCaseload(token)

    // Caseload protection: without an active caseload the user has no establishment to view, so we
    // show a guidance page and never call the property API. The list is always scoped to the user's
    // own active caseload, so they can only ever see data for an establishment they hold.
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    const { search, containerTypes, statuses, includeRemoved, page, apiQuery } = parsePropertyListQuery(
      req.query,
      DEFAULT_PAGE_SIZE,
    )

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
    if (includeRemoved) baseQueryParams.set('includeRemoved', 'true')

    return res.render('pages/propertyList', {
      establishmentName: activeCaseloadName,
      canManage: canManageProperty(res.locals.user.userRoles),
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
      // Only the two statuses that map to a ContainerStatus are wired; the other two are disabled
      // placeholders until the API models "due for return" / "due for transfer in".
      statusItems: [
        { value: 'DISPOSAL_REQUIRED_PLACEHOLDER', text: 'Due for return', disabled: true },
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

    return res.render('pages/prisonerPropertyHistory', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      banner,
      timeline: buildPrisonerTimeline(timelineItems, prisonerNumber),
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

    return res.render('pages/containerHistory', {
      prisonerNumber,
      prisonerName: container.prisonerName,
      container,
      events,
      backUrl: `/prisoner/${prisonerNumber}`,
    })
  })

  // ---- Add a property container journey (single container, gated on the manage role) ----

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

  const renderDetails = async (
    req: import('express').Request,
    res: import('express').Response,
    ctx: JourneyContext,
    data: Record<string, unknown>,
    errors: Record<string, { text: string; href: string }> = {},
  ) => {
    const { username } = res.locals.user
    const containers = await prisonerPropertyService.getPropertyForPrisoner(ctx.prisonerNumber, username)
    return res.render('pages/addContainer/details', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      establishmentName: ctx.activeCaseloadName,
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

  router.get('/prisoner/:prisonerNumber/add-container', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    req.session.addContainerJourney = { prisonerNumber: ctx.prisonerNumber }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
  })

  router.get('/prisoner/:prisonerNumber/add-container/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    return renderDetails(req, res, ctx, {
      sealNumber: journey?.sealNumber,
      previousSealNumber: journey?.previousSealNumber,
      containerType: journey?.containerType,
      ...isoToParts(journey?.proposedDisposalDate),
    })
  })

  router.post('/prisoner/:prisonerNumber/add-container/details', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined

    const { values, errors } = validateDetails(req.body)
    if (!values) {
      return renderDetails(
        req,
        res,
        ctx,
        {
          sealNumber: req.body.sealNumber,
          previousSealNumber: req.body.previousSealNumber,
          containerType: req.body.containerType,
          day: req.body['disposalDate-day'],
          month: req.body['disposalDate-month'],
          year: req.body['disposalDate-year'],
        },
        errors,
      )
    }

    req.session.addContainerJourney = {
      ...req.session.addContainerJourney,
      prisonerNumber: ctx.prisonerNumber,
      sealNumber: values.sealNumber,
      previousSealNumber: values.previousSealNumber,
      containerType: values.containerType,
      proposedDisposalDate: values.proposedDisposalDate,
    }

    // If a location was already chosen (editing details from Check your answers), return to CYA;
    // otherwise carry on to the location step.
    const next2 = req.session.addContainerJourney.internalLocationId ? 'check' : 'location'
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/${next2}`)
  })

  router.get('/prisoner/:prisonerNumber/add-container/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
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
      backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/details`,
    })
  })

  router.post('/prisoner/:prisonerNumber/add-container/location', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }

    req.session.addContainerJourney = {
      ...journey,
      internalLocationId: req.body.internalLocationId,
      locationName: req.body.locationName,
    }
    return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/check`)
  })

  router.get('/prisoner/:prisonerNumber/add-container/check', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (!journey?.sealNumber || !journey?.containerType) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }
    if (!journey.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/location`)
    }

    const { username } = res.locals.user
    const containers = await prisonerPropertyService.getPropertyForPrisoner(ctx.prisonerNumber, username)

    return res.render('pages/addContainer/checkAnswers', {
      prisonerNumber: ctx.prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      establishmentName: ctx.activeCaseloadName,
      journey,
      backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/location`,
    })
  })

  router.post('/prisoner/:prisonerNumber/add-container/confirm', requireManageRole, async (req, res, next) => {
    const ctx = await resolveContext(req, res, next)
    if (!ctx) return undefined
    const journey = req.session.addContainerJourney
    if (!journey?.sealNumber || !journey?.containerType || !journey.internalLocationId) {
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    }

    const { username } = res.locals.user
    try {
      const created = await prisonerPropertyService.createContainer(
        {
          prisonerNumber: ctx.prisonerNumber,
          prisonId: ctx.activeCaseloadId,
          containerType: journey.containerType,
          sealNumber: journey.sealNumber,
          previousSealNumber: journey.previousSealNumber,
          internalLocationId: journey.internalLocationId,
          proposedDisposalDate: journey.proposedDisposalDate,
        },
        username,
      )

      await auditService.logPageView(Page.ADD_PROPERTY_CONTAINER, {
        who: username,
        subjectId: ctx.prisonerNumber,
        subjectType: 'PRISONER_NUMBER',
        correlationId: req.id,
        details: { containerId: created.id },
      })

      req.session.addContainerJourney = undefined
      req.flash('success', 'Property container added')
      return res.redirect(`/prisoner/${ctx.prisonerNumber}`)
    } catch (error) {
      const status = (error as { responseStatus?: number }).responseStatus
      if (status === 409) {
        req.flash('error', 'A property container with this seal number already exists. Enter a different seal number.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
      }
      if (status === 400) {
        req.flash('error', 'That storage location could not be used. Select a different location.')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/location`)
      }
      return next(error)
    }
  })

  return router
}

import { Router } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  ALL_STATUSES,
  buildPagination,
  containerTypeLabel,
  DEFAULT_PAGE_SIZE,
  isPrisonerNumber,
  parsePropertyListQuery,
  statusTag,
} from '../utils/propertyList'
import { buildPersonPropertyView } from '../utils/personProperty'
import { validateDetails } from '../utils/addContainer'
import requireManageRole, { canManageProperty } from '../middleware/requireManageRole'

const BOX_PAGE_SIZE = 20

export default function routes({ auditService, prisonerPropertyService, userService }: Services): Router {
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

    const { search, containerType, statuses, storageLocation, page, apiQuery } = parsePropertyListQuery(
      req.query,
      DEFAULT_PAGE_SIZE,
    )

    const result = await prisonerPropertyService.getPrisonProperty(activeCaseloadId, apiQuery, username)

    await auditService.logPageView(Page.PROPERTY_LIST, {
      who: username,
      correlationId: req.id,
      details: { prisonId: activeCaseloadId },
    })

    const baseQueryParams = new URLSearchParams()
    if (search) baseQueryParams.set('q', search)
    if (containerType) baseQueryParams.set('containerType', containerType)
    statuses.forEach(status => baseQueryParams.append('status', status))
    if (storageLocation) baseQueryParams.set('storageLocation', storageLocation)

    return res.render('pages/propertyList', {
      establishmentName: activeCaseloadName,
      canManage: canManageProperty(res.locals.user.userRoles),
      groups: result.content,
      pagination: buildPagination(
        page,
        result.totalPages,
        result.totalElements,
        result.size,
        baseQueryParams.toString(),
      ),
      search,
      storageLocation,
      containerTypeItems: [
        { value: '', text: 'All property types' },
        ...ALL_CONTAINER_TYPES.map(type => ({
          value: type,
          text: containerTypeLabel(type),
          selected: type === containerType,
        })),
      ],
      statusItems: ALL_STATUSES.map(status => ({
        value: status,
        text: statusTag(status).text,
        checked: statuses.includes(status),
      })),
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

    const containers = await prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username)

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

    return res.render('pages/prisonerProperty', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      prisonerCurrentPrisonName,
      hasLeft,
      inEstablishment,
      dueToTransferIn,
      canManage: canManageProperty(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      backUrl: '/',
    })
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

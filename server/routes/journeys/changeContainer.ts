import { Router, type Request, type RequestHandler, type Response } from 'express'
import createError from 'http-errors'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  buildPagination,
  containerLocation,
  containerTypeLabel,
  statusTag,
} from '../../utils/propertyList'
import { validateDetails } from '../../utils/addContainer'
import { disposalBanner } from '../../utils/changeContainer'
import requireManageRole from '../../middleware/requireManageRole'
import type { PrisonerPropertyContainer } from '../../data/prisonerPropertyApiTypes'
import {
  BOX_PAGE_SIZE,
  isoToParts,
  type JourneyContext,
  loadRemovableContainer,
  manageLocationsHrefFor,
  resolveContext,
} from '../journeyHelpers'

// ---- Change a property container journey (gated on the manage role) ----

export default function changeContainerRoutes(
  { auditService, prisonerPropertyService, userService }: Services,
  requireActivePrisonMw: RequestHandler,
): Router {
  const router = Router()

  const renderChangeDetails = async (
    req: Request,
    res: Response,
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

  router.get(
    '/prisoner/:prisonerNumber/change-container/:id',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/change-container/:id',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)
      const journey = req.session.changeContainerJourney
      if (journey?.containerId !== id) {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/change-container/${id}`)
      }

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/change-container/:id/location',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
        manageLocationsHref: manageLocationsHrefFor(req, res.locals.user.userRoles),
      })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/change-container/:id/location',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/change-container/:id/check',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/change-container/:id/confirm',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
          req.flash(
            'error',
            'A property container with this seal number already exists. Enter a different seal number.',
          )
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
    },
  )

  return router
}

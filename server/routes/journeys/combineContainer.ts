import { Router, type Request, type RequestHandler, type Response } from 'express'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import { ALL_CONTAINER_TYPES, buildPagination, containerTypeLabel } from '../../utils/propertyList'
import { buildPersonPropertyView } from '../../utils/personProperty'
import { validateDetails } from '../../utils/addContainer'
import requireManageRole from '../../middleware/requireManageRole'
import {
  BOX_PAGE_SIZE,
  isoToParts,
  type JourneyContext,
  manageLocationsHrefFor,
  resolveContext,
} from '../journeyHelpers'

// ---- Combine property containers journey (person view, gated on the manage role) ----

export default function combineContainerRoutes(
  { auditService, prisonerPropertyService, userService }: Services,
  requireActivePrisonMw: RequestHandler,
): Router {
  const router = Router()

  // The selected sources with their person-view status tag, in the order they were chosen. Rebuilt from
  // the prisoner's current property so the display (and its status) stays authoritative.
  const combineSourceRows = async (ctx: JourneyContext, ids: string[], username: string) => {
    const containers = await prisonerPropertyService.getPropertyForPrisoner(ctx.prisonerNumber, username)
    const { inEstablishment } = buildPersonPropertyView(containers, ctx.activeCaseloadId)
    const byId = new Map(inEstablishment.map(row => [row.container.id, row]))
    return { containers, sources: ids.map(id => byId.get(id)).filter(Boolean) as typeof inEstablishment }
  }

  const renderCombineDetails = async (
    req: Request,
    res: Response,
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

  router.post('/prisoner/:prisonerNumber/combine', requireManageRole, requireActivePrisonMw, async (req, res, next) => {
    const ctx = await resolveContext(userService, req, res, next)
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

  router.get(
    '/prisoner/:prisonerNumber/combine/details',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/combine/details',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/combine/location',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
        manageLocationsHref: manageLocationsHrefFor(req, res.locals.user.userRoles),
      })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/combine/location',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/combine/check',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/combine/confirm',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
          req.flash(
            'error',
            'A property container with this seal number already exists. Enter a different seal number.',
          )
          return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
        }
        if (status === 400) {
          req.flash('error', 'That storage location could not be used. Select a different location.')
          const step = journey.locationType === 'BRANSTON' ? 'details' : 'location'
          return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/${step}`)
        }
        return next(error)
      }
    },
  )

  return router
}

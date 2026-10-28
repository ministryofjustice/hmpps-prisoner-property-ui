import { Router, type Request, type RequestHandler, type Response } from 'express'

import type { Services } from '../../services'
import {
  ALL_CONTAINER_TYPES,
  buildPagination,
  canManageContainerHere,
  containerLocation,
  containerTypeLabel,
} from '../../utils/propertyList'
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

  // The prison storage locations the sources are held in, one per location, so the new container can go back
  // to one of them. The API does not count the sources against a location's capacity when combining, but the
  // "Select a storage location" list does (they are still there until the combine is saved), so these would
  // otherwise be unavailable whenever the location is full.
  const sourceLocationsOf = (sources: Awaited<ReturnType<typeof combineSourceRows>>['sources']) => [
    ...new Map(
      sources
        .map(row => row.container)
        .filter(c => c.currentLocationType === 'INTERNAL' && c.currentLocation)
        .map(c => [c.currentLocation as string, { id: c.currentLocation as string, name: containerLocation(c) }]),
    ).values(),
  ]

  // The step where the storage location was picked, for back links and errors: a new location on "Select a
  // storage location"; otherwise Branston or a source's location, on "Where is this excess property stored?"
  // for excess and on the details page for anything else.
  const locationStep = (journey: NonNullable<import('express-session').SessionData['combineJourney']>) => {
    if (journey.locationChoice === 'new') return 'location'
    return journey.containerType === 'EXCESS' ? 'where-stored' : 'details'
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
      sourceLocations: sourceLocationsOf(sources),
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
    const selectable = new Set(containers.filter(c => canManageContainerHere(c, ctx.activeCaseloadId)).map(c => c.id))
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
        locationChoice: journey.locationChoice === 'source' ? journey.internalLocationId : journey.locationChoice,
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

      const { username } = res.locals.user
      const { sources } = await combineSourceRows(ctx, journey.sourceContainerIds, username)
      const sourceLocations = sourceLocationsOf(sources)
      const sourceLocation = sourceLocations.find(location => location.id === req.body.locationChoice)
      const locationChosen = sourceLocation != null || req.body.locationChoice === 'new'

      const { values, errors } = validateDetails(req.body)
      // With no source location to offer, "A new storage location" is the only option, so nothing to choose.
      const mustChooseLocation = values?.containerType !== 'EXCESS' && sourceLocations.length > 0
      if (!locationChosen && mustChooseLocation) {
        errors.locationChoice = { text: 'Select a storage location', href: '#locationChoice' }
      }
      if (!values || errors.locationChoice) {
        return renderCombineDetails(
          req,
          res,
          ctx,
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

      // Excess property chooses where it is stored (off-site at Branston or a prison location) on a separate
      // step, as in the add and change journeys. Keep any prior storage decision only while the container is
      // still excess (editing from CYA); changing the type into excess resets it.
      if (values.containerType === 'EXCESS') {
        const wasExcess = journey.containerType === 'EXCESS'
        req.session.combineJourney = {
          ...journey,
          sealNumber: values.sealNumber,
          containerType: values.containerType,
          proposedDisposalDate: values.proposedDisposalDate,
          locationChoice: wasExcess ? journey.locationChoice : undefined,
          locationType: wasExcess ? journey.locationType : undefined,
          internalLocationId: wasExcess ? journey.internalLocationId : undefined,
          locationName: wasExcess ? journey.locationName : undefined,
        }
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/where-stored`)
      }

      // Back to a source's location goes straight to CYA. A new location keeps one already picked (editing
      // details from CYA), otherwise goes on to choose it.
      const keptNewLocation = journey.locationChoice === 'new' ? journey : undefined
      req.session.combineJourney = {
        ...journey,
        sealNumber: values.sealNumber,
        containerType: values.containerType,
        proposedDisposalDate: values.proposedDisposalDate,
        locationChoice: sourceLocation ? 'source' : 'new',
        locationType: 'INTERNAL',
        internalLocationId: sourceLocation?.id ?? keptNewLocation?.internalLocationId,
        locationName: sourceLocation?.name ?? keptNewLocation?.locationName,
      }

      const next2 = req.session.combineJourney.internalLocationId ? 'check' : 'location'
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/${next2}`)
    },
  )

  // Excess property only: choose whether it is stored off-site at Branston, back in one of the sources' prison
  // locations, or in a new prison location.
  router.get(
    '/prisoner/:prisonerNumber/combine/where-stored',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const journey = req.session.combineJourney
      if (!journey?.sealNumber || journey.containerType !== 'EXCESS') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
      }

      const { username } = res.locals.user
      const { sources } = await combineSourceRows(ctx, journey.sourceContainerIds, username)
      let storageChoice: string | undefined
      if (journey.locationType === 'BRANSTON') storageChoice = 'branston'
      else if (journey.locationChoice === 'source') storageChoice = journey.internalLocationId
      else storageChoice = journey.locationChoice

      return res.render('pages/combine/whereStored', {
        prisonerNumber: ctx.prisonerNumber,
        sealNumber: journey.sealNumber,
        sourceLocations: sourceLocationsOf(sources),
        storageChoice,
        backUrl: `/prisoner/${ctx.prisonerNumber}/combine/details`,
        errorBanner: req.flash('error')[0],
      })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/combine/where-stored',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const journey = req.session.combineJourney
      if (!journey?.sealNumber || journey.containerType !== 'EXCESS') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/details`)
      }

      if (req.body.storageChoice === 'branston') {
        req.session.combineJourney = {
          ...journey,
          locationChoice: undefined,
          locationType: 'BRANSTON',
          internalLocationId: undefined,
          locationName: undefined,
        }
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/check`)
      }

      const { username } = res.locals.user
      const { sources } = await combineSourceRows(ctx, journey.sourceContainerIds, username)
      const sourceLocation = sourceLocationsOf(sources).find(location => location.id === req.body.storageChoice)
      if (!sourceLocation && req.body.storageChoice !== 'new') {
        req.flash('error', 'Select where this property is stored')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/where-stored`)
      }

      // Back to a source's location goes straight to CYA. A new location keeps one already picked (editing
      // from CYA), otherwise goes on to choose it.
      const keptNewLocation = journey.locationChoice === 'new' ? journey : undefined
      req.session.combineJourney = {
        ...journey,
        locationChoice: sourceLocation ? 'source' : 'new',
        locationType: 'INTERNAL',
        internalLocationId: sourceLocation?.id ?? keptNewLocation?.internalLocationId,
        locationName: sourceLocation?.name ?? keptNewLocation?.locationName,
      }
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
        backUrl: `/prisoner/${ctx.prisonerNumber}/combine/${journey.containerType === 'EXCESS' ? 'where-stored' : 'details'}`,
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
        locationChoice: 'new',
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
        backUrl: `/prisoner/${ctx.prisonerNumber}/combine/${locationStep(journey)}`,
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

        await auditService.logAuditEvent(
          {
            action: 'CREATE_COMBINED_PROPERTY_CONTAINER',
            who: username,
            subjectId: ctx.prisonerNumber,
            subjectType: 'PRISONER_ID',
            correlationId: req.id,
            details: { containerId: created.id, sourceContainerIds: journey.sourceContainerIds },
          },
          { throwOnError: false, logOnError: true },
        )

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
          return res.redirect(`/prisoner/${ctx.prisonerNumber}/combine/${locationStep(journey)}`)
        }
        return next(error)
      }
    },
  )

  return router
}

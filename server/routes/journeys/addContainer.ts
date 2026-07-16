import { Router, type Request, type RequestHandler, type Response } from 'express'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import { ALL_CONTAINER_TYPES, buildPagination, containerTypeLabel, DEFAULT_PAGE_SIZE } from '../../utils/propertyList'
import { toContainerBlocks, validateContainers } from '../../utils/addContainer'
import requireManageRole from '../../middleware/requireManageRole'
import {
  BOX_PAGE_SIZE,
  isoToParts,
  type JourneyContext,
  manageLocationsHrefFor,
  resolveContext,
} from '../journeyHelpers'

// ---- Add property container(s) journey: search for a person, then add one or more (manage role) ----

export default function addContainerRoutes(
  { auditService, prisonerPropertyService, prisonerService, userService }: Services,
  requireActivePrisonMw: RequestHandler,
): Router {
  const router = Router()

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
    req: Request,
    res: Response,
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
  router.get('/add-container', requireManageRole, requireActivePrisonMw, async (req, res) => {
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

  router.get(
    '/prisoner/:prisonerNumber/add-container',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const origin = req.query.from === 'list' ? 'list' : 'person'
      req.session.addContainerJourney = { prisonerNumber: ctx.prisonerNumber, origin, containers: [{}] }
      return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/add-container/details',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const journey = req.session.addContainerJourney
      if (journey?.prisonerNumber !== ctx.prisonerNumber) {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container`)
      }
      return renderAddDetails(req, res, ctx, journey.origin, journey.containers.map(draftToView))
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/add-container/details',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/add-container/location/:index',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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

      // Other containers being added in this same journey may already be assigned to a location but not
      // yet saved, so the API's spaces figure does not reflect them. Subtract those pending claims so the
      // user cannot over-fill a location across a multi-container add (the API is still the final backstop).
      const claimedByDraft = new Map<string, number>()
      journey.containers.forEach((container, i) => {
        if (i !== index && container.internalLocationId) {
          claimedByDraft.set(container.internalLocationId, (claimedByDraft.get(container.internalLocationId) ?? 0) + 1)
        }
      })
      const locations = result.content.map(location => ({
        ...location,
        availableSpaces: location.availableSpaces - (claimedByDraft.get(location.id) ?? 0),
      }))

      const baseQuery = new URLSearchParams()
      if (query) baseQuery.set('query', query)

      return res.render('pages/addContainer/location', {
        prisonerNumber: ctx.prisonerNumber,
        sealNumber: draft.sealNumber,
        query: query ?? '',
        locations,
        pagination: buildPagination(page, result.totalPages, result.totalElements, result.size, baseQuery.toString()),
        searchError,
        errorBanner: req.flash('error')[0],
        backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/details`,
        manageLocationsHref: manageLocationsHrefFor(req, res.locals.user.userRoles),
      })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/add-container/location/:index',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/add-container/check',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/add-container/confirm',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
          req.flash(
            'error',
            'A property container with this seal number already exists. Enter a different seal number.',
          )
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
    },
  )

  return router
}

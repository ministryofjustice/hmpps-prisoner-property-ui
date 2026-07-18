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

  // The next container that still needs a storage decision, from `from` onwards, and which step it needs:
  // excess property first chooses where it is stored ('where-stored'), then picks a prison location only if it
  // was not sent off-site to Branston; other types just pick a location. null when all are resolved.
  const nextStep = (
    containers: AddContainerDraft[],
    from: number,
  ): { index: number; step: 'where-stored' | 'location' } | null => {
    for (let i = from; i < containers.length; i += 1) {
      const c = containers[i]
      if (c.containerType === 'EXCESS') {
        if (!c.storageChoice) return { index: i, step: 'where-stored' }
        if (c.storageChoice === 'internal' && !c.internalLocationId) return { index: i, step: 'location' }
      } else if (!c.internalLocationId) {
        return { index: i, step: 'location' }
      }
    }
    return null
  }

  // The URL of the next step (the check-answers page when there is none left).
  const nextStepUrl = (prisonerNumber: string, next: ReturnType<typeof nextStep>): string =>
    next === null
      ? `/prisoner/${prisonerNumber}/add-container/check`
      : `/prisoner/${prisonerNumber}/add-container/${next.step}/${next.index}`

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

      // Keep the storage decision already made for a container at the same index (editing from Check your
      // answers), but only while its type is unchanged - changing the type (e.g. to/from Excess) resets the
      // storage choice so the correct steps are taken again.
      const containers: AddContainerDraft[] = values.map((v, i) => {
        const previous = journey.containers[i]
        const keep = previous?.containerType === v.containerType
        return {
          sealNumber: v.sealNumber,
          previousSealNumber: v.previousSealNumber,
          containerType: v.containerType,
          proposedDisposalDate: v.proposedDisposalDate,
          storageChoice: keep ? previous?.storageChoice : undefined,
          internalLocationId: keep ? previous?.internalLocationId : undefined,
          locationName: keep ? previous?.locationName : undefined,
        }
      })
      req.session.addContainerJourney = { ...journey, containers }

      return res.redirect(nextStepUrl(ctx.prisonerNumber, nextStep(containers, 0)))
    },
  )

  // Excess property only: choose whether it is stored off-site at Branston or in a prison location.
  router.get(
    '/prisoner/:prisonerNumber/add-container/where-stored/:index',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const journey = req.session.addContainerJourney
      const index = Number.parseInt(String(req.params.index), 10)
      const draft = journey?.containers?.[index]
      if (journey?.prisonerNumber !== ctx.prisonerNumber || !draft?.sealNumber || draft.containerType !== 'EXCESS') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
      }
      return res.render('pages/addContainer/whereStored', {
        prisonerNumber: ctx.prisonerNumber,
        index,
        sealNumber: draft.sealNumber,
        storageChoice: draft.storageChoice,
        backUrl: `/prisoner/${ctx.prisonerNumber}/add-container/details`,
        errorBanner: req.flash('error')[0],
      })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/add-container/where-stored/:index',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const journey = req.session.addContainerJourney
      const index = Number.parseInt(String(req.params.index), 10)
      const draft = journey?.containers?.[index]
      if (journey?.prisonerNumber !== ctx.prisonerNumber || !draft || draft.containerType !== 'EXCESS') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/details`)
      }

      const rawChoice = req.body.storageChoice
      const storageChoice = rawChoice === 'internal' || rawChoice === 'branston' ? rawChoice : undefined
      if (!storageChoice) {
        req.flash('error', 'Select where this property is stored')
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/add-container/where-stored/${index}`)
      }

      // Branston is off-site with no internal location, so clear any location previously picked.
      journey.containers[index] = {
        ...draft,
        storageChoice,
        internalLocationId: storageChoice === 'branston' ? undefined : draft.internalLocationId,
        locationName: storageChoice === 'branston' ? undefined : draft.locationName,
      }
      req.session.addContainerJourney = journey

      return res.redirect(nextStepUrl(ctx.prisonerNumber, nextStep(journey.containers, index)))
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
        // Excess reached the location step by choosing "a prison location", so Back returns to that choice.
        backUrl:
          draft.containerType === 'EXCESS'
            ? `/prisoner/${ctx.prisonerNumber}/add-container/where-stored/${index}`
            : `/prisoner/${ctx.prisonerNumber}/add-container/details`,
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

      return res.redirect(nextStepUrl(ctx.prisonerNumber, nextStep(journey.containers, index + 1)))
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
      const missing = nextStep(journey.containers, 0)
      if (missing !== null) {
        return res.redirect(nextStepUrl(ctx.prisonerNumber, missing))
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
          // Excess sent off-site reads "Branston (offsite)"; excess in a prison location (or any other type)
          // shows its picked location.
          storageLocation:
            c.containerType === 'EXCESS' && c.storageChoice !== 'internal' ? 'Branston (offsite)' : c.locationName,
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
              internalLocationId: c.internalLocationId,
              // Excess sent off-site is stored at Branston (no internal location); otherwise the API infers
              // INTERNAL from the location id.
              locationType: c.containerType === 'EXCESS' && c.storageChoice === 'branston' ? 'BRANSTON' : undefined,
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

import { Router } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import { isPrisonerNumber } from '../utils/propertyList'
import { buildPersonPropertyView, buildReturnedOrTransferredView } from '../utils/personProperty'
import { buildPrisonerBanner, fallbackPrisonerBanner } from '../utils/prisonerBanner'
import { buildPrisonerTimeline } from '../utils/prisonerTimeline'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import { canManageProperty } from '../middleware/requireManageRole'
import logger from '../../logger'

// The prisoner image placeholder shown when prison-api has no photo (or the call fails).
const PRISONER_IMAGE_PLACEHOLDER = '/assets/images/prisoner-image-withheld.svg'

export default function prisonerPropertyRoutes({
  auditService,
  prisonerPropertyService,
  prisonerService,
  userService,
  activeAgenciesService,
}: Services): Router {
  const router = Router()

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

    // Edits are gated on both the manage role and the establishment being switched on in DPS; a
    // role-holder on a NOMIS-managed prison sees the property read-only with a "view only" banner.
    const hasManageRole = canManageProperty(res.locals.user.userRoles)
    const isActivePrison = await activeAgenciesService.isPrisonActive(activeCaseloadId)

    return res.render('pages/prisonerProperty', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      prisonerCurrentPrisonName,
      hasLeft,
      banner,
      inEstablishment,
      dueToTransferIn,
      canManage: hasManageRole && isActivePrison,
      showNomisBanner: hasManageRole && !isActivePrison,
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
      canManage: canManageProperty(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/returned', async (req, res, next) => {
    const { token, username } = res.locals.user
    const { prisonerNumber } = req.params

    const { activeCaseloadId } = await userService.getActiveCaseload(token)
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    if (!isPrisonerNumber(prisonerNumber)) {
      return next(createError(404, 'Prisoner not found'))
    }

    // The person's containers already include their removed/returned/disposed/transferred property, so
    // one call feeds both this tab's list and the shared header (name + banner fallback). Prisoner-search
    // feeds the banner but is not essential to the page.
    const [containers, prisoner] = await Promise.all([
      prisonerPropertyService.getPropertyForPrisoner(prisonerNumber, username),
      prisonerService.getPrisonerDetails(prisonerNumber, username).catch((error: Error): Prisoner | null => {
        logger.warn(`Failed to load prisoner-search details for ${prisonerNumber}: ${error.message}`)
        return null
      }),
    ])

    await auditService.logPageView(Page.PRISONER_PROPERTY_RETURNED, {
      who: username,
      subjectId: prisonerNumber,
      subjectType: 'PRISONER_NUMBER',
      correlationId: req.id,
    })

    const banner = prisoner
      ? buildPrisonerBanner(prisonerNumber, prisoner, activeCaseloadId)
      : fallbackPrisonerBanner(prisonerNumber, containers[0]?.prisonerName ?? null)

    return res.render('pages/prisonerPropertyReturned', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      banner,
      returned: buildReturnedOrTransferredView(containers),
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

  return router
}

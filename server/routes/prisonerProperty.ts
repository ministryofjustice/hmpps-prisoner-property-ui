import { Router } from 'express'
import createError from 'http-errors'

import type { Services } from '../services'
import { movementEstablishmentLabel } from '../utils/propertyList'
import { buildPersonPropertyView, buildReturnedOrTransferredView } from '../utils/personProperty'
import { buildPrisonerBanner, fallbackPrisonerBanner, type PrisonerBanner } from '../utils/prisonerBanner'
import { buildPrisonerTimeline } from '../utils/prisonerTimeline'
import { scopeTimeline } from '../utils/prisonerAccess'
import { canManageProperty } from '../middleware/requireManageRole'
import { type PrisonerAccessContext, requirePrisonerAccess } from '../middleware/requirePrisonerAccess'
import logger from '../../logger'

// The prisoner image placeholder shown when prison-api has no photo (or the call fails).
const PRISONER_IMAGE_PLACEHOLDER = '/assets/images/prisoner-image-withheld.svg'

export default function prisonerPropertyRoutes(services: Services): Router {
  const { prisonerPropertyService, prisonerService, userService, activeAgenciesService } = services
  const router = Router()

  // Every prisoner route, the photo included, goes through the access rules first. The guard also loads the
  // property and prisoner-search details, already limited to what this user may see, into
  // res.locals.prisonerAccess.
  const requireAccess = requirePrisonerAccess(services)

  // Edits are gated on both the manage role and the establishment being switched on in DPS; a role-holder
  // on a NOMIS-managed prison sees the property read-only with a "view only" banner. Every person tab needs
  // this — the "Add a property container" button lives in the shared header partial, so a tab that computes canManage
  // from the role alone puts a button on the page that the server-side gate then rejects.
  const manageFlags = async (userRoles: string[], activeCaseloadId: string) => {
    const hasManageRole = canManageProperty(userRoles)
    const isActivePrison = await activeAgenciesService.isPrisonActive(activeCaseloadId)
    return { canManage: hasManageRole && isActivePrison, showNomisBanner: hasManageRole && !isActivePrison }
  }

  // The shared header's banner. The link to the DPS prisoner profile is only offered with full access: someone
  // here only for property at their prison would be refused by the profile.
  const bannerFor = (access: PrisonerAccessContext): PrisonerBanner => {
    const { prisonerNumber, prisoner, containers, activeCaseloadId } = access
    const banner = prisoner
      ? buildPrisonerBanner(prisonerNumber, prisoner, activeCaseloadId, containers[0]?.prisonerMovementStatus)
      : fallbackPrisonerBanner(prisonerNumber, containers[0]?.prisonerName ?? null)
    return { ...banner, showProfileLink: access.level === 'FULL' }
  }

  router.get('/prisoner/:prisonerNumber', requireAccess, async (req, res) => {
    const access = res.locals.prisonerAccess!
    const { prisonerNumber, activeCaseloadId, containers } = access

    // Movement status is a prisoner-level attribute mirrored on every container; use it so the banner
    // and the "Establishment" column read "Transferring"/"Released" rather than "Not known", and so the
    // view can list property left behind while its owner is between establishments.
    const prisonerMovementStatus = containers[0]?.prisonerMovementStatus

    const { inEstablishment, dueToTransferIn, elsewhereInTransit, hasLeft, prisonerCurrentPrisonName } =
      buildPersonPropertyView(containers, activeCaseloadId, prisonerMovementStatus)
    const banner = bannerFor(access)

    return res.render('pages/prisonerProperty', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      prisonerCurrentPrisonName,
      prisonerEstablishmentLabel: movementEstablishmentLabel(prisonerMovementStatus, prisonerCurrentPrisonName),
      hasLeft,
      banner,
      inEstablishment,
      dueToTransferIn,
      elsewhereInTransit,
      ...(await manageFlags(res.locals.user.userRoles, activeCaseloadId)),
      successMessage: req.flash('success')[0],
      errorMessage: req.flash('error')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/history', requireAccess, async (req, res) => {
    const { username } = res.locals.user
    const access = res.locals.prisonerAccess!
    const { prisonerNumber, activeCaseloadId, containers, level } = access

    // The timeline is the tab's own data, limited to the containers this user may see; the property list from
    // the guard feeds only the shared header (name + banner fallback).
    const timelineItems = scopeTimeline(
      await prisonerPropertyService.getPrisonerPropertyHistory(prisonerNumber, username),
      level,
      containers,
    )

    const banner = bannerFor(access)

    const nameByUsername = await userService.getUserDisplayNames(
      timelineItems.map(item => item.eventUserId),
      username,
    )

    return res.render('pages/prisonerPropertyHistory', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      banner,
      timeline: buildPrisonerTimeline(timelineItems, prisonerNumber, nameByUsername),
      ...(await manageFlags(res.locals.user.userRoles, activeCaseloadId)),
      successMessage: req.flash('success')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/returned', requireAccess, async (req, res) => {
    const access = res.locals.prisonerAccess!
    const { prisonerNumber, activeCaseloadId, containers } = access

    // The person's containers already include their removed/returned/disposed/transferred property, so the
    // guard's list feeds both this tab and the shared header (name + banner fallback).
    const banner = bannerFor(access)

    return res.render('pages/prisonerPropertyReturned', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      banner,
      returned: buildReturnedOrTransferredView(containers),
      ...(await manageFlags(res.locals.user.userRoles, activeCaseloadId)),
      successMessage: req.flash('success')[0],
      backUrl: '/',
    })
  })

  router.get('/prisoner/:prisonerNumber/image', requireAccess, async (req, res) => {
    const { username } = res.locals.user
    const { prisonerNumber } = res.locals.prisonerAccess!

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

  router.get('/prisoner/:prisonerNumber/container/:id', requireAccess, async (req, res, next) => {
    const { username } = res.locals.user
    const id = String(req.params.id)
    const { prisonerNumber, containers } = res.locals.prisonerAccess!

    // Resolve the container from the property this user may see of this prisoner's, so the URL is coherent (the
    // container belongs to this prisoner) and a container at another prison is refused when access comes only
    // from property here. 404 otherwise.
    const container = containers.find(c => c.id === id)
    if (!container) {
      return next(createError(404, 'Property container not found'))
    }

    const events = await prisonerPropertyService.getContainerEvents(id, username)

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

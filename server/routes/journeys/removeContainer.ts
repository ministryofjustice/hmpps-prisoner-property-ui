import { Router, type RequestHandler, type Response } from 'express'
import createError from 'http-errors'

import type { Services } from '../../services'
import { Page } from '../../services/auditService'
import { statusTag } from '../../utils/propertyList'
import {
  isRemoveReason,
  removalDateLabel,
  REMOVE_REASONS,
  removeResultStatus,
  resolveTransferTarget,
} from '../../utils/removeContainer'
import requireManageRole from '../../middleware/requireManageRole'
import type { PrisonerPropertyContainer } from '../../data/prisonerPropertyApiTypes'
import { type JourneyContext, loadRemovableContainer, resolveContext } from '../journeyHelpers'

// ---- Remove a property container journey (gated on the manage role) ----

export default function removeContainerRoutes(
  { auditService, prisonerPropertyService, userService }: Services,
  requireActivePrisonMw: RequestHandler,
): Router {
  const router = Router()

  const removeBackUrl = (ctx: JourneyContext, origin: 'list' | 'person'): string =>
    origin === 'list' ? '/' : `/prisoner/${ctx.prisonerNumber}`

  const renderRemoveReason = (
    res: Response,
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

  router.get(
    '/prisoner/:prisonerNumber/remove-container/:id',
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
      req.session.removeContainerJourney = { prisonerNumber: ctx.prisonerNumber, containerId: id, origin }
      return renderRemoveReason(res, ctx, container, origin, { errorBanner: req.flash('error')[0] })
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/remove-container/:id',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)
      const origin = req.session.removeContainerJourney?.origin ?? 'person'

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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
    },
  )

  router.get(
    '/prisoner/:prisonerNumber/remove-container/:id/interruption',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)
      const journey = req.session.removeContainerJourney

      if (journey?.containerId !== id || journey?.outcome !== 'TRANSFERRED') {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
      }

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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

  router.get(
    '/prisoner/:prisonerNumber/remove-container/:id/check',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
      if (!ctx) return undefined
      const { username } = res.locals.user
      const id = String(req.params.id)
      const journey = req.session.removeContainerJourney

      if (journey?.containerId !== id || !journey?.outcome) {
        return res.redirect(`/prisoner/${ctx.prisonerNumber}/remove-container/${id}`)
      }

      const container = await loadRemovableContainer(prisonerPropertyService, ctx.prisonerNumber, id, username)
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
    },
  )

  router.post(
    '/prisoner/:prisonerNumber/remove-container/:id/confirm',
    requireManageRole,
    requireActivePrisonMw,
    async (req, res, next) => {
      const ctx = await resolveContext(userService, req, res, next)
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
    },
  )

  return router
}

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
import { partitionContainers, resolveCurrentPrisonName } from '../utils/personProperty'

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

    const { active, past } = partitionContainers(containers)

    return res.render('pages/prisonerProperty', {
      prisonerNumber,
      prisonerName: containers[0]?.prisonerName ?? null,
      currentPrisonName: resolveCurrentPrisonName(containers),
      active,
      past,
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

  return router
}

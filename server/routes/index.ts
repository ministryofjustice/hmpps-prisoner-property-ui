import { Router } from 'express'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  ALL_STATUSES,
  buildPagination,
  containerTypeLabel,
  DEFAULT_PAGE_SIZE,
  parsePropertyListQuery,
  statusTag,
} from '../utils/propertyList'

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

  return router
}

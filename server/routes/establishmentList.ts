import { Router } from 'express'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  buildPagination,
  containerTypeLabel,
  DEFAULT_PAGE_SIZE,
  parsePropertyListQuery,
  statusTag,
  TRANSFER_IN_FILTER_VALUE,
} from '../utils/propertyList'
import { canManageProperty } from '../middleware/requireManageRole'
import { canAdminister } from '../middleware/requireAdminRole'

export default function establishmentListRoutes({
  auditService,
  prisonerPropertyService,
  userService,
  activeAgenciesService,
}: Services): Router {
  const router = Router()

  router.get('/', async (req, res, _next) => {
    const { token, username } = res.locals.user

    const { activeCaseloadId } = await userService.getActiveCaseload(token)

    // Caseload protection: without an active caseload the user has no establishment to view, so we
    // show a guidance page and never call the property API. The list is always scoped to the user's
    // own active caseload, so they can only ever see data for an establishment they hold.
    if (!activeCaseloadId) {
      return res.render('pages/noCaseload')
    }

    const { search, containerTypes, statuses, includeRemoved, personLocations, dueForTransferIn, page, apiQuery } =
      parsePropertyListQuery(req.query, DEFAULT_PAGE_SIZE)

    // The summary counts come from a separate endpoint. Fetch it alongside the list, but degrade
    // gracefully: if it fails (e.g. the endpoint isn't deployed yet) render the list without the bar.
    const [result, summary] = await Promise.all([
      prisonerPropertyService.getPrisonProperty(activeCaseloadId, apiQuery, username),
      prisonerPropertyService.getPrisonPropertySummary(activeCaseloadId, username).catch((): null => null),
    ])

    await auditService.logPageView(Page.PROPERTY_LIST, {
      who: username,
      correlationId: req.id,
      details: { prisonId: activeCaseloadId },
    })

    const baseQueryParams = new URLSearchParams()
    if (search) baseQueryParams.set('q', search)
    containerTypes.forEach(type => baseQueryParams.append('containerType', type))
    statuses.forEach(status => baseQueryParams.append('status', status))
    // "Due for transfer in" shares the status checkbox group, so it round-trips as a status value.
    if (dueForTransferIn) baseQueryParams.append('status', TRANSFER_IN_FILTER_VALUE)
    personLocations.forEach(location => baseQueryParams.append('personLocation', location))
    if (includeRemoved) baseQueryParams.set('includeRemoved', 'true')

    // Writes are allowed only when the user holds the manage role AND the establishment is switched on
    // in DPS. When they hold the role but the prison is still managed in NOMIS, show an explanatory
    // "view only" banner so they understand why the edit controls are gone.
    const hasManageRole = canManageProperty(res.locals.user.userRoles)
    const isActivePrison = await activeAgenciesService.isPrisonActive(activeCaseloadId)

    return res.render('pages/propertyList', {
      canManage: hasManageRole && isActivePrison,
      showNomisBanner: hasManageRole && !isActivePrison,
      isAdmin: canAdminister(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      includeRemoved,
      summary,
      viewedPrisonId: activeCaseloadId,
      groups: result.content,
      pagination: buildPagination(
        page,
        result.totalPages,
        result.totalElements,
        result.size,
        baseQueryParams.toString(),
      ),
      search,
      containerTypeItems: ALL_CONTAINER_TYPES.map(type => ({
        value: type,
        text: containerTypeLabel(type),
        checked: containerTypes.includes(type),
      })),
      // "Due for transfer in" stays a disabled placeholder until the API models the receiving-prison view.
      statusItems: [
        {
          value: 'DUE_FOR_RETURN',
          text: statusTag('DUE_FOR_RETURN').text,
          checked: statuses.includes('DUE_FOR_RETURN'),
        },
        {
          value: 'DISPOSAL_REQUIRED',
          text: statusTag('DISPOSAL_REQUIRED').text,
          checked: statuses.includes('DISPOSAL_REQUIRED'),
        },
        {
          value: 'DUE_FOR_TRANSFER_OUT',
          text: statusTag('DUE_FOR_TRANSFER_OUT').text,
          checked: statuses.includes('DUE_FOR_TRANSFER_OUT'),
        },
        {
          value: TRANSFER_IN_FILTER_VALUE,
          text: 'Due for transfer in',
          checked: dueForTransferIn,
        },
      ],
      personLocationItems: [
        {
          value: 'IN_ESTABLISHMENT',
          text: 'Property for people in this establishment',
          checked: personLocations.includes('IN_ESTABLISHMENT'),
        },
        {
          value: 'LEFT_ESTABLISHMENT',
          text: 'Property for people no longer in this establishment',
          checked: personLocations.includes('LEFT_ESTABLISHMENT'),
        },
      ],
    })
  })

  return router
}

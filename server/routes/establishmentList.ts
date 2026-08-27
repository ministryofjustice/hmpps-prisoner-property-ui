import { Router } from 'express'

import type { Services } from '../services'
import { Page } from '../services/auditService'
import {
  ALL_CONTAINER_TYPES,
  appliedFilterTags,
  buildPagination,
  CLEAR_FILTERS_HREF,
  containerTypeLabel,
  DEFAULT_PAGE_SIZE,
  listQueryString,
  parsePropertyListQuery,
  statusTag,
  TRANSFER_IN_FILTER_VALUE,
} from '../utils/propertyList'
import { canManageProperty } from '../middleware/requireManageRole'
import { canAdminister } from '../middleware/requireAdminRole'
import { canManageLocations } from '../middleware/requireLocationAdminRole'

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

    // Clearing has to be an explicit signal, because a bare "/" now means "restore what I had" - the
    // "Clear search" and "Clear filters" links would otherwise re-apply the very filters they remove.
    if (req.query.clear) {
      req.session.propertyListQuery = undefined
      return res.redirect('/')
    }

    // Coming back from a prisoner, a completed journey or a breadcrumb: restore what the user was looking at.
    // Only on a bare "/" - any explicit query wins, so a bookmarked or shared filtered link still works and
    // the back button behaves. Both redirects happen before the flash message is read below, or a success
    // banner would be consumed by the request that redirects and never shown.
    const remembered = req.session.propertyListQuery
    if (!Object.keys(req.query).length && remembered?.prisonId === activeCaseloadId && remembered.query) {
      return res.redirect(`/?${remembered.query}`)
    }

    const parsed = parsePropertyListQuery(req.query, DEFAULT_PAGE_SIZE)
    const { search, containerTypes, statuses, includeRemoved, personLocations, dueForTransferIn, page, apiQuery } =
      parsed

    // Remember this view for next time, scoped to the establishment so switching caseload does not inherit
    // another prison's filters. An unfiltered view stores nothing, which also makes "apply filters with
    // nothing ticked" behave as a clear - and avoids creating a session for read-only users who never filter.
    const rememberedQuery = listQueryString(parsed, { includePage: true })
    if (rememberedQuery) {
      req.session.propertyListQuery = { prisonId: activeCaseloadId, query: rememberedQuery }
    } else if (req.session.propertyListQuery) {
      req.session.propertyListQuery = undefined
    }

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

    // Writes are allowed only when the user holds the manage role AND the establishment is switched on
    // in DPS. When they hold the role but the prison is still managed in NOMIS, show an explanatory
    // "view only" banner so they understand why the edit controls are gone.
    const hasManageRole = canManageProperty(res.locals.user.userRoles)
    const isActivePrison = await activeAgenciesService.isPrisonActive(activeCaseloadId)

    return res.render('pages/propertyList', {
      canManage: hasManageRole && isActivePrison,
      showNomisBanner: hasManageRole && !isActivePrison,
      isAdmin: canAdminister(res.locals.user.userRoles),
      isLocationAdmin: canManageLocations(res.locals.user.userRoles),
      successMessage: req.flash('success')[0],
      includeRemoved,
      // What is currently narrowing the list, shown above the collapsed filters so it is visible without
      // opening them - the filters persist between visits, so they are not always ones set in this sitting.
      appliedFilters: appliedFilterTags(parsed),
      clearFiltersHref: CLEAR_FILTERS_HREF,
      summary,
      viewedPrisonId: activeCaseloadId,
      groups: result.content,
      pagination: buildPagination(
        page,
        result.totalPages,
        result.totalElements,
        result.size,
        // Each pagination link appends its own page, so the base deliberately leaves it out.
        listQueryString(parsed),
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
          text: 'In this establishment',
          checked: personLocations.includes('IN_ESTABLISHMENT'),
        },
        {
          value: 'LEFT_ESTABLISHMENT',
          text: 'No longer in this establishment',
          checked: personLocations.includes('LEFT_ESTABLISHMENT'),
        },
      ],
    })
  })

  return router
}

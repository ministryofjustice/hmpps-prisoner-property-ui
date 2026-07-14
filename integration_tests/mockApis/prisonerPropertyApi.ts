import type { SuperAgentRequest } from 'superagent'
import { stubFor, stubPing } from './wiremock'
import type {
  AgencyStatus,
  BoxLocation,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonPropertySummary,
  PrisonerTimelineItem,
  PropertyEvent,
  PropertyLocationAdmin,
} from '../../server/data/prisonerPropertyApiTypes'

export default {
  stubPing: (httpStatus = 200): SuperAgentRequest => stubPing('/prisoner-property-api', httpStatus),

  stubGetPropertyForPrisoner: (
    {
      prisonerNumber = 'A1234BC',
      containers = [] as PrisonerPropertyContainer[],
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prisoner/${prisonerNumber}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: containers,
      },
    }),

  stubGetPrisonProperty: (
    { prisonId = 'MDI', groups = [] as PrisonerPropertyGroup[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prison/${prisonId}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: {
          content: groups,
          totalElements: groups.length,
          totalPages: groups.length === 0 ? 0 : 1,
          number: 0,
          size: 20,
          numberOfElements: groups.length,
          first: true,
          last: true,
        },
      },
    }),

  stubGetPrisonPropertySummary: (
    {
      prisonId = 'MDI',
      summary = {
        availableStorageSpaces: 0,
        storedOnSite: 0,
        dueToTransferOut: 0,
        dueToBeReturned: 0,
        dueToBeDisposed: 0,
      } as PrisonPropertySummary,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prison/${prisonId}/summary`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: summary,
      },
    }),

  stubGetContainerEvents: (
    { id = 'c1', events = [] as PropertyEvent[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/${id}/events`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: events,
      },
    }),

  stubGetPrisonerPropertyHistory: (
    {
      prisonerNumber = 'A1234BC',
      items = [] as PrisonerTimelineItem[],
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prisoner/${prisonerNumber}/events`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: items,
      },
    }),

  stubGetBoxLocations: (
    { prisonId = 'MDI', locations = [] as BoxLocation[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prison/${prisonId}/box-locations`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: {
          content: locations,
          totalElements: locations.length,
          totalPages: locations.length === 0 ? 0 : 1,
          number: 0,
          size: 20,
          numberOfElements: locations.length,
          first: true,
          last: true,
        },
      },
    }),

  stubCreateContainer: (
    { container = undefined as PrisonerPropertyContainer | undefined, priority = undefined as number | undefined } = {},
    httpStatus = 201,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'POST',
        urlPath: `/prisoner-property-api/property-containers`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: container ?? {},
      },
    }),

  stubRemoveContainer: (
    {
      id = 'c1',
      container = undefined as PrisonerPropertyContainer | undefined,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'POST',
        urlPath: `/prisoner-property-api/property-containers/${id}/remove`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: container ?? {},
      },
    }),

  stubCombineContainers: (
    { container = undefined as PrisonerPropertyContainer | undefined, priority = undefined as number | undefined } = {},
    httpStatus = 201,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'POST',
        urlPath: `/prisoner-property-api/property-containers/combine`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: container ?? {},
      },
    }),

  stubUpdateContainer: (
    {
      id = 'c1',
      container = undefined as PrisonerPropertyContainer | undefined,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'PUT',
        urlPath: `/prisoner-property-api/property-containers/${id}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: container ?? {},
      },
    }),

  // The read pages resolve which prisons are switched on in DPS from the public /info endpoint. Default
  // it to MDI (the default active caseload) so specs get the pre-active-prison-gate behaviour (writes
  // enabled); a spec can pass `activeAgencies: []` to exercise the NOMIS read-only banner.
  stubGetInfo: (
    { activeAgencies = ['MDI'] as string[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/info`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { activeAgencies },
      },
    }),

  stubGetAllAgencies: (
    { agencies = [] as AgencyStatus[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/active-agencies/all`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: agencies,
      },
    }),

  stubSetAgencyActive: (
    {
      agencyId = 'MDI',
      name = agencyId,
      active = true,
      priority = undefined,
    }: { agencyId?: string; name?: string; active?: boolean; priority?: number } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'PUT',
        urlPath: `/prisoner-property-api/active-agencies/${agencyId}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { agencyId, name, active },
      },
    }),

  stubGetPropertyLocations: (
    { prisonId = 'MDI', locations = [] as PropertyLocationAdmin[], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-locations/prison/${prisonId}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: locations,
      },
    }),

  stubCreatePropertyLocation: (
    {
      prisonId = 'MDI',
      location = undefined as PropertyLocationAdmin | undefined,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 201,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'POST',
        urlPath: `/prisoner-property-api/property-locations/prison/${prisonId}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: location,
      },
    }),

  stubUpdatePropertyLocation: (
    {
      id = 'loc-1',
      location = undefined as PropertyLocationAdmin | undefined,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'PUT',
        urlPath: `/prisoner-property-api/property-locations/${id}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: location,
      },
    }),

  stubRemovePropertyLocation: (
    {
      id = 'loc-1',
      location = undefined as PropertyLocationAdmin | undefined,
      priority = undefined as number | undefined,
    } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'DELETE',
        urlPath: `/prisoner-property-api/property-locations/${id}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: location,
      },
    }),
}

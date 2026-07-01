import type { SuperAgentRequest } from 'superagent'
import { stubFor, stubPing } from './wiremock'
import type { PrisonerPropertyGroup } from '../../server/data/prisonerPropertyApiTypes'

export default {
  stubPing: (httpStatus = 200): SuperAgentRequest => stubPing('/prisoner-property-api', httpStatus),

  stubGetPropertyForPrisoner: (prisonerNumber = 'A1234BC', httpStatus = 200): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'GET',
        urlPath: `/prisoner-property-api/property-containers/prisoner/${prisonerNumber}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: [],
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
}

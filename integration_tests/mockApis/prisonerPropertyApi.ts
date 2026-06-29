import type { SuperAgentRequest } from 'superagent'
import { stubFor, stubPing } from './wiremock'

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
}

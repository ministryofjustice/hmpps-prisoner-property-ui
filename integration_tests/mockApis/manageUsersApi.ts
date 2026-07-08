import type { SuperAgentRequest } from 'superagent'
import { stubFor, stubPing } from './wiremock'

const activeCaseloadDefault = { id: 'MDI', name: 'Moorland (HMP & YOI)' }

export default {
  stubPing: (httpStatus = 200): SuperAgentRequest => stubPing('/manage-users-api', httpStatus),

  stubGetMyCaseloads: (
    activeCaseload: { id: string; name: string } | null = activeCaseloadDefault,
    priority: number | undefined = undefined,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: '/manage-users-api/users/me/caseloads',
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: {
          username: 'USER1',
          active: true,
          accountType: 'GENERAL',
          activeCaseload,
          caseloads: activeCaseload ? [activeCaseload] : [],
        },
      },
    }),

  stubGetUser: ({
    username,
    name,
    priority,
  }: {
    username: string
    name: string
    priority?: number
  }): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/manage-users-api/users/${username}`,
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { username, name, active: true },
      },
    }),
}

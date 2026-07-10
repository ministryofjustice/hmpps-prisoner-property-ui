import type { SuperAgentRequest } from 'superagent'
import { stubFor } from './wiremock'
import type { SplashScreen } from '../../server/data/prisonApiTypes'

const NOMIS_PROPERTY_MODULE = 'OIDMPCON'

export default {
  // Stub the OIDMPCON splash screen the admin console reads to show each prison's NOMIS state. Default
  // 404 = screen not set up (admin list degrades to the "unavailable" notice).
  stubGetSplashScreen: (
    { conditions = [] as SplashScreen['conditions'], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULE}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { moduleName: NOMIS_PROPERTY_MODULE, blockAccessType: 'COND', conditions },
      },
    }),

  // Stub the write endpoints used by the NOMIS controls so a control POST succeeds in e2e.
  stubAddSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: { method: 'POST', urlPath: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULE}/condition` },
      response: { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' }, jsonBody: {} },
    }),

  stubUpdateSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'PUT',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULE}/condition/.*`,
      },
      response: { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' }, jsonBody: {} },
    }),

  stubRemoveSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'DELETE',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULE}/condition/.*`,
      },
      response: { status: 200 },
    }),
}

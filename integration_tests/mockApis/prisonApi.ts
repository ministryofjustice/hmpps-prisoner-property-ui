import type { SuperAgentRequest } from 'superagent'
import { stubFor } from './wiremock'
import type { SplashScreen } from '../../server/data/prisonApiTypes'

// Matches every NOMIS property screen the admin console warns/blocks together (OIDMPCON and OIUPROPE).
const NOMIS_PROPERTY_MODULES = '(OIDMPCON|OIUPROPE)'

export default {
  // Stub the NOMIS property splash screens the admin console reads to show each prison's NOMIS state -
  // both screens return the same conditions. Default 404 = screen not set up (admin list degrades to the
  // "unavailable" notice).
  stubGetSplashScreen: (
    { conditions = [] as SplashScreen['conditions'], priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULES}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { moduleName: 'OIDMPCON', blockAccessType: 'COND', conditions },
      },
    }),

  // Stub the write endpoints used by the NOMIS controls so a control POST succeeds in e2e.
  stubAddSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'POST',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULES}/condition`,
      },
      response: { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' }, jsonBody: {} },
    }),

  stubUpdateSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'PUT',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULES}/condition/.*`,
      },
      response: { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' }, jsonBody: {} },
    }),

  stubRemoveSplashCondition: (): SuperAgentRequest =>
    stubFor({
      request: {
        method: 'DELETE',
        urlPathPattern: `/prison-api/api/splash-screen/${NOMIS_PROPERTY_MODULES}/condition/.*`,
      },
      response: { status: 200 },
    }),
}

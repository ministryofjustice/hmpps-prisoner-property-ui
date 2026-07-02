import type { SuperAgentRequest } from 'superagent'
import { stubFor } from './wiremock'

// A minimal stand-in for the DPS common header/footer. It carries the same data-qa hooks the page
// objects assert on, so switching from the local header to the shared component keeps specs stable.
const headerHtml = `
  <header data-qa="common-header" class="connect-dps-common-header" role="banner">
    <span data-qa="header-phase-banner">dev</span>
    <a data-qa="manageDetails" class="connect-dps-common-header__link" href="/account-details">
      <span data-qa="header-user-name">J. Smith</span>
      <span>Manage your details</span>
    </a>
    <a class="connect-dps-common-header__link" href="/sign-out">Sign out</a>
  </header>`

const footerHtml = `
  <footer data-qa="common-footer" class="connect-dps-common-footer" role="contentinfo">
    <a class="connect-dps-common-footer__link" href="/feedback">Feedback</a>
  </footer>`

export default {
  stubPing: (httpStatus = 200): SuperAgentRequest =>
    stubFor({
      request: { method: 'GET', urlPath: '/component/ping' },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: { status: httpStatus === 200 ? 'UP' : 'DOWN' },
      },
    }),

  stubComponents: (): SuperAgentRequest =>
    stubFor({
      request: { method: 'GET', urlPath: '/component/components' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: {
          header: { html: headerHtml, css: [], javascript: [] },
          footer: { html: footerHtml, css: [], javascript: [] },
          meta: {
            caseLoads: [],
            activeCaseLoad: null,
            services: [],
            allocationJobResponsibilities: [],
            cspDirectives: {},
          },
        },
      },
    }),
}

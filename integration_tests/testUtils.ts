import { Page } from '@playwright/test'
import tokenVerification from './mockApis/tokenVerification'
import hmppsAuth, { type UserToken } from './mockApis/hmppsAuth'
import frontendComponents from './mockApis/frontendComponents'
import manageUsersApi from './mockApis/manageUsersApi'
import prisonerPropertyApi from './mockApis/prisonerPropertyApi'
import prisonerSearchApi from './mockApis/prisonerSearchApi'
import { resetStubs } from './mockApis/wiremock'

export { resetStubs }

const DEFAULT_ROLES = ['ROLE_SOME_REQUIRED_ROLE']

export const attemptHmppsAuthLogin = async (page: Page) => {
  await page.goto('/')
  page.locator('h1', { hasText: 'Sign in' })
  const url = await hmppsAuth.getSignInUrl()
  return page.goto(url)
}

export const login = async (
  page: Page,
  { name, roles = DEFAULT_ROLES, active = true, authSource = 'nomis' }: UserToken & { active?: boolean } = {},
) => {
  await Promise.all([
    hmppsAuth.favicon(),
    hmppsAuth.stubSignInPage(),
    hmppsAuth.stubSignOutPage(),
    hmppsAuth.token({ name, roles, authSource }),
    tokenVerification.stubVerifyToken(active),
    // The DPS shared header/footer are fetched on every authenticated page
    frontendComponents.stubComponents(),
    // The landing page ('/') is the establishment property list, so give it a working caseload +
    // an empty property page by default. Specs can re-stub for specific data before navigating.
    manageUsersApi.stubGetMyCaseloads(),
    prisonerPropertyApi.stubGetPrisonProperty(),
    // Prisoner banner defaults: prisoner-search details plus a 404 image (falls back to the placeholder).
    prisonerSearchApi.stubGetPrisoner(),
    prisonerSearchApi.stubGetPrisonerImage(),
  ])
  return attemptHmppsAuthLogin(page)
}

import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import ChangeContainerDetailsPage from '../pages/changeContainerDetailsPage'
import ChangeContainerCheckAnswersPage from '../pages/changeContainerCheckAnswersPage'
import type { PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'

const existingContainer: PrisonerPropertyContainer = {
  id: 'c1',
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  inPrisonersCurrentPrison: true,
  containerType: 'STANDARD',
  currentSealNumber: 'SN8842K1',
  currentStatus: 'STORED',
  currentLocation: 'loc1',
  currentLocationType: 'INTERNAL',
  locationDescription: 'PB4599',
  proposedDisposalDate: null,
  removalOutcome: null,
  removalDate: null,
  createDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
}

test.describe('Change a property container', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('changes a container (keeping its location) and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })
    await prisonerPropertyApi.stubUpdateContainer({ id: 'c1', container: existingContainer, priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await personPage.inEstablishment.getByTestId('change-link').first().click()

    const detailsPage = await ChangeContainerDetailsPage.verifyOnPage(page)
    await expect(detailsPage.heading).toContainText('SN8842K1')
    await expect(detailsPage.sealNumber).toHaveValue('SN8842K1')
    await expect(detailsPage.removeButton).toBeVisible()
    await detailsPage.keepLocationAndContinue({ seal: 'SN8842K1', type: 'Valuables' })

    const checkPage = await ChangeContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Valuables')
    await expect(checkPage.containerSummary).toContainText('PB4599')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container updated')
  })

  test('shows an overdue disposal warning for a container past its disposal date', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [{ ...existingContainer, currentStatus: 'DISPOSAL_REQUIRED', proposedDisposalDate: '2020-01-01' }],
      priority: 1,
    })

    await page.goto('/prisoner/A1234BC/change-container/c1?from=person')
    const detailsPage = await ChangeContainerDetailsPage.verifyOnPage(page)
    await expect(detailsPage.disposalBanner).toContainText('is overdue')
    await expect(detailsPage.disposalBanner).toContainText('remove this container record')
  })

  test('refuses the journey for a user without the manage role', async ({ page }) => {
    await login(page)

    await page.goto('/prisoner/A1234BC/change-container/c1')
    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

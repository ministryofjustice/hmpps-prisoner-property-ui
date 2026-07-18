import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import RemoveContainerReasonPage from '../pages/removeContainerReasonPage'
import RemoveContainerInterruptionPage from '../pages/removeContainerInterruptionPage'
import RemoveContainerCheckAnswersPage from '../pages/removeContainerCheckAnswersPage'
import type { PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'

const existingContainer: PrisonerPropertyContainer = {
  id: 'c1',
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  inPrisonersCurrentPrison: true,
  containerType: 'STANDARD',
  currentSealNumber: 'SN0001',
  currentStatus: 'STORED',
  currentLocation: null,
  currentLocationType: 'INTERNAL',
  locationDescription: 'Reception A1',
  proposedDisposalDate: null,
  removalOutcome: null,
  removalDate: null,
  createDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
}

test.describe('Remove a property container', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('removes a container as returned and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })
    await prisonerPropertyApi.stubRemoveContainer({ id: 'c1', container: existingContainer, priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await personPage.inEstablishment.getByTestId('remove-link').first().click()

    const reasonPage = await RemoveContainerReasonPage.verifyOnPage(page)
    await expect(reasonPage.heading).toContainText('SN0001')
    await reasonPage.chooseReason('The property has been returned')
    await reasonPage.remove.click()

    const checkPage = await RemoveContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Returned')
    await expect(checkPage.containerSummary).toContainText('Date property returned')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container removed')
  })

  test('warns with an interruption when transferring before the prisoner has been received elsewhere', async ({
    page,
  }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })

    await page.goto('/prisoner/A1234BC/remove-container/c1?from=person')
    const reasonPage = await RemoveContainerReasonPage.verifyOnPage(page)
    await reasonPage.chooseReason('The property was transferred to another establishment')
    await reasonPage.remove.click()

    const interruptionPage = await RemoveContainerInterruptionPage.verifyOnPage(page)
    await expect(interruptionPage.panel).toContainText('has not been received into')
    await expect(interruptionPage.continue).toBeVisible()
  })

  test('refuses the journey for a user without the manage role', async ({ page }) => {
    await login(page)

    await page.goto('/prisoner/A1234BC/remove-container/c1')
    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

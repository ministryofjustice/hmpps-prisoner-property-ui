import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import AddContainerDetailsPage from '../pages/addContainerDetailsPage'
import AddContainerLocationPage from '../pages/addContainerLocationPage'
import AddContainerCheckAnswersPage from '../pages/addContainerCheckAnswersPage'
import type { BoxLocation, PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'

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
  archived: false,
}

const box: BoxLocation = {
  id: 'box1',
  prisonId: 'MDI',
  code: 'PROP1',
  localName: 'Reception Store',
  pathHierarchy: 'RECP-PROP1',
  name: 'Reception Store',
  containerCount: 0,
}

test.describe('Add a property container', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('adds a container end to end and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetBoxLocations({ prisonId: 'MDI', locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: { ...existingContainer, id: 'newC' }, priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.addProperty).toBeVisible()
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.completeWith({ seal: 'SN9', type: 'Valuables' })

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('SN9')
    await expect(locationPage.locations.getByRole('cell', { name: 'Reception Store', exact: true })).toBeVisible()
    await locationPage.selectFirstLocation()

    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('SN9')
    await expect(checkPage.containerSummary).toContainText('Reception Store')
    await expect(checkPage.containerSummary).toContainText('Valuables')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container added')
  })

  test('hides the add journey from a user without the manage role', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.addProperty).toBeHidden()

    // Direct navigation to a journey step is refused.
    await page.goto('/prisoner/A1234BC/add-container/details')
    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import CombineDetailsPage from '../pages/combineDetailsPage'
import AddContainerLocationPage from '../pages/addContainerLocationPage'
import CombineCheckAnswersPage from '../pages/combineCheckAnswersPage'
import type { BoxLocation, PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'

const source = (id: string, seal: string): PrisonerPropertyContainer => ({
  id,
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  inPrisonersCurrentPrison: true,
  containerType: 'STANDARD',
  currentSealNumber: seal,
  currentStatus: 'STORED',
  currentLocation: null,
  currentLocationType: 'INTERNAL',
  locationDescription: 'Reception A1',
  proposedDisposalDate: null,
  removalOutcome: null,
  removalDate: null,
  createDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
})

const box: BoxLocation = {
  id: 'box1',
  prisonId: 'MDI',
  code: 'PROP1',
  localName: 'Reception Store',
  pathHierarchy: 'RECP-PROP1',
  name: 'Reception Store',
  containerCount: 0,
  capacity: 10,
  availableSpaces: 10,
}

test.describe('Combine property containers', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('combines two containers end to end and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [source('c1', 'BOX635'), source('c2', 'BOX447')],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetBoxLocations({ prisonId: 'MDI', locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCombineContainers({ container: source('newC', 'BOX442'), priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await page.locator('#select-c1').check()
    await page.locator('#select-c2').check()
    await personPage.combineButton.click()

    const detailsPage = await CombineDetailsPage.verifyOnPage(page)
    await expect(detailsPage.sources).toContainText('BOX635')
    await expect(detailsPage.sources).toContainText('BOX447')
    await detailsPage.completeWith({ seal: 'BOX442', type: 'Standard' })

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('BOX442')
    await locationPage.selectFirstLocation()

    const checkPage = await CombineCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('BOX442')
    await expect(checkPage.containerSummary).toContainText('Reception Store')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property containers combined')
  })

  test('skips the storage-location step for excess (off-site) property', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [source('c1', 'BOX635'), source('c2', 'BOX447')],
      priority: 1,
    })
    await prisonerPropertyApi.stubCombineContainers({ container: source('newC', 'BOX442'), priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await page.locator('#select-c1').check()
    await page.locator('#select-c2').check()
    await personPage.combineButton.click()

    const detailsPage = await CombineDetailsPage.verifyOnPage(page)
    await detailsPage.completeWith({ seal: 'BOX442', type: 'Excess' })

    // Excess goes straight to Check your answers, showing Branston as the storage location.
    const checkPage = await CombineCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Branston')
  })

  test('refuses the journey for a user without the manage role', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [source('c1', 'BOX635'), source('c2', 'BOX447')],
      priority: 1,
    })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.combineButton).toBeHidden()
  })
})

import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import prisonerSearchApi from '../mockApis/prisonerSearchApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import PropertyListPage from '../pages/propertyListPage'
import AddContainerDetailsPage from '../pages/addContainerDetailsPage'
import AddContainerLocationPage from '../pages/addContainerLocationPage'
import AddContainerCheckAnswersPage from '../pages/addContainerCheckAnswersPage'
import type { BoxLocation, PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'
import type { Prisoner } from '../../server/data/prisonerSearchApiTypes'

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

const prisoner: Prisoner = {
  prisonerNumber: 'A1234BC',
  firstName: 'John',
  lastName: 'Smith',
  dateOfBirth: '2001-01-01',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  cellLocation: 'F-3-042',
  status: 'ACTIVE IN',
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

  test('adds a container from the person view and shows a success banner', async ({ page }) => {
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
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    // The optional disposal date shows Day/Month/Year labels, not the raw bracketed field names.
    await expect(page.getByLabel('Day')).toBeVisible()
    await expect(page.getByLabel('Month')).toBeVisible()
    await expect(page.getByLabel('Year')).toBeVisible()
    await expect(page.getByText('[disposalDate]')).toHaveCount(0)
    await detailsPage.completeWith({ seal: 'SN9', type: 'Valuables' })

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('SN9')
    await locationPage.selectFirstLocation()

    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary.first()).toContainText('SN9')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container(s) added')
  })

  test('searches from the establishment list, then adds two containers (one Excess)', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [], priority: 1 })
    await prisonerSearchApi.stubSearchPrisoners({ prisoners: [prisoner] })
    await prisonerSearchApi.stubGetPrisoner({ prisoner })
    await prisonerSearchApi.stubGetPrisonerImage({ prisonerNumber: 'A1234BC' })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ prisonerNumber: 'A1234BC', containers: [], priority: 1 })
    await prisonerPropertyApi.stubGetBoxLocations({ prisonId: 'MDI', locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: { ...existingContainer, id: 'newC' }, priority: 1 })

    await page.goto('/')
    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.addButton.click()

    await page.getByLabel('Who is the property container for?').fill('Smith')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByTestId('add-link').first().click()

    // Two containers: a Standard (needs a location) and an Excess (off-site, skips the location step).
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.fillContainer(0, { seal: 'SN1', type: 'Standard' })
    await detailsPage.addAnother()
    await detailsPage.fillContainer(1, { seal: 'SN2', type: 'Excess' })
    await detailsPage.saveAndContinue()

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('SN1')
    await locationPage.selectFirstLocation()

    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(page.getByRole('heading', { name: /Property container SN1/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Property container SN2/ })).toBeVisible()
    await checkPage.confirm.click()

    // Confirm creates both and returns to the establishment list with the banner.
    await expect(page.getByTestId('success-banner')).toContainText('Property container(s) added')
  })

  test('refuses the search entry for a user without the manage role', async ({ page }) => {
    await login(page)

    await page.goto('/add-container')
    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

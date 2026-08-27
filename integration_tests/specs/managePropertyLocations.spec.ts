import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import ManagePropertyLocationsPage from '../pages/managePropertyLocationsPage'
import type { PropertyLocationAdmin } from '../../server/data/prisonerPropertyApiTypes'

const location: PropertyLocationAdmin = {
  id: 'loc-1',
  prisonId: 'MDI',
  code: 'PROP1',
  name: 'Reception Store',
  locationType: 'BOX',
  capacity: 10,
  containersHeld: 3,
  availableSpaces: 7,
}

test.describe('Manage property storage locations', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('lists the storage locations with capacity and how full they are', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__LOCATION_ADMIN'] })
    await prisonerPropertyApi.stubGetPropertyLocations({ prisonId: 'MDI', locations: [location] })

    await page.goto('/admin/locations')

    const managePage = await ManagePropertyLocationsPage.verifyOnPage(page)
    await expect(managePage.table).toContainText('Reception Store')
    await expect(managePage.table).toContainText('10') // capacity
    await expect(managePage.table).toContainText('7') // spaces left
  })

  test('adds a storage location end to end and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__LOCATION_ADMIN'] })
    await prisonerPropertyApi.stubGetPropertyLocations({ prisonId: 'MDI', locations: [], priority: 2 })
    await prisonerPropertyApi.stubCreatePropertyLocation({
      prisonId: 'MDI',
      location: { ...location, name: 'Property Store B', containersHeld: 0, availableSpaces: 12, capacity: 12 },
    })

    await page.goto('/admin/locations')
    const managePage = await ManagePropertyLocationsPage.verifyOnPage(page)
    await managePage.addLocationLink.click()

    await page.getByLabel('Storage location name').fill('Property Store B')
    await page.getByLabel('Capacity').fill('12')

    // After the successful create the list is re-read - stub it to include the new location.
    await prisonerPropertyApi.stubGetPropertyLocations({
      prisonId: 'MDI',
      locations: [{ ...location, name: 'Property Store B', containersHeld: 0, availableSpaces: 12, capacity: 12 }],
      priority: 1,
    })
    await page.getByRole('button', { name: 'Add storage location' }).click()

    const backPage = await ManagePropertyLocationsPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('added')
    await expect(backPage.table).toContainText('Property Store B')
  })

  test('blocks removal of a location that still holds property, offering only a way back', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__LOCATION_ADMIN'] })
    // loc-1 holds 3 containers, so removal is impossible and must not be offered.
    await prisonerPropertyApi.stubGetPropertyLocations({ prisonId: 'MDI', locations: [location], priority: 2 })

    await page.goto('/admin/locations/loc-1/remove')

    await expect(page.getByRole('heading', { name: 'You cannot remove Reception Store' })).toBeVisible()
    await expect(page.getByTestId('in-use-warning')).toContainText(
      'Reception Store contains 3 property containers. You must move or remove the containers before you can remove this storage location.',
    )
    await expect(page.getByRole('button', { name: 'Remove storage location' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(0)

    await page.getByTestId('back-to-locations').click()
    await ManagePropertyLocationsPage.verifyOnPage(page)
  })

  test('confirms removal of an empty location, then removes it', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__LOCATION_ADMIN'] })
    await prisonerPropertyApi.stubGetPropertyLocations({
      prisonId: 'MDI',
      locations: [{ ...location, containersHeld: 0, availableSpaces: 10 }],
      priority: 2,
    })
    await prisonerPropertyApi.stubRemovePropertyLocation({ id: 'loc-1' })

    await page.goto('/admin/locations/loc-1/remove')

    await expect(page.getByRole('heading', { name: 'Remove Reception Store?' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove storage location' }).click()

    const managePage = await ManagePropertyLocationsPage.verifyOnPage(page)
    await expect(managePage.successBanner).toContainText('removed')
  })

  test('rejects an edit that drops capacity below the containers currently held', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__LOCATION_ADMIN'] })
    // loc-1 holds 3 containers, so a capacity of 2 must be rejected inline without calling the update.
    await prisonerPropertyApi.stubGetPropertyLocations({ prisonId: 'MDI', locations: [location] })

    await page.goto('/admin/locations/loc-1/edit')
    await page.getByLabel('Capacity').fill('2')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.locator('body')).toContainText(
      'Capacity cannot be less than the 3 containers currently stored here',
    )
  })

  test('is forbidden for a user without the location-admin role', async ({ page }) => {
    await login(page)
    await page.goto('/admin/locations')
    await expect(page.locator('body')).toContainText('not authorised', { ignoreCase: true })
  })
})

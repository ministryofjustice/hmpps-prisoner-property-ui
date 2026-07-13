import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class ManagePropertyLocationsPage extends AbstractPage {
  readonly heading: Locator

  readonly addLocationLink: Locator

  readonly table: Locator

  readonly successBanner: Locator

  readonly errorBanner: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: 'Manage storage locations' })
    this.addLocationLink = page.getByTestId('add-location')
    this.table = page.getByTestId('locations')
    this.successBanner = page.getByTestId('success-banner')
    this.errorBanner = page.getByTestId('error-banner')
  }

  static async verifyOnPage(page: Page): Promise<ManagePropertyLocationsPage> {
    const managePage = new ManagePropertyLocationsPage(page)
    await expect(managePage.heading).toBeVisible()
    return managePage
  }
}

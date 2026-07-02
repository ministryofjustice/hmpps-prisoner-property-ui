import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AddContainerLocationPage extends AbstractPage {
  readonly heading: Locator

  readonly locations: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('location-heading')
    this.locations = page.getByTestId('locations')
  }

  static async verifyOnPage(page: Page): Promise<AddContainerLocationPage> {
    const locationPage = new AddContainerLocationPage(page)
    await expect(locationPage.heading).toBeVisible()
    return locationPage
  }

  async selectFirstLocation(): Promise<void> {
    await this.locations
      .getByRole('button', { name: /Select location/ })
      .first()
      .click()
  }
}

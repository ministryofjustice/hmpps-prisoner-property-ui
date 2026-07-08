import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class ChangeContainerDetailsPage extends AbstractPage {
  readonly heading: Locator

  readonly sealNumber: Locator

  readonly removeButton: Locator

  readonly disposalBanner: Locator

  readonly saveAndContinue: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('change-container-heading')
    this.sealNumber = page.locator('#sealNumber')
    this.removeButton = page.getByTestId('remove-container-button')
    this.disposalBanner = page.getByTestId('disposal-banner')
    this.saveAndContinue = page.getByRole('button', { name: 'Save and continue' })
  }

  // "Keep current location" is the default selection, so we only set the seal + type.
  async keepLocationAndContinue({ seal, type }: { seal: string; type: string }) {
    await this.sealNumber.fill(seal)
    await this.page.getByLabel(type, { exact: true }).check()
    await this.saveAndContinue.click()
  }

  static async verifyOnPage(page: Page): Promise<ChangeContainerDetailsPage> {
    const detailsPage = new ChangeContainerDetailsPage(page)
    await expect(detailsPage.heading).toBeVisible()
    return detailsPage
  }
}

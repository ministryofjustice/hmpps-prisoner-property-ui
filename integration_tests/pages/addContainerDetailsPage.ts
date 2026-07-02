import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AddContainerDetailsPage extends AbstractPage {
  readonly heading: Locator

  readonly sealNumber: Locator

  readonly errorSummary: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('add-container-heading')
    this.sealNumber = page.locator('#sealNumber')
    this.errorSummary = page.locator('.govuk-error-summary')
  }

  static async verifyOnPage(page: Page): Promise<AddContainerDetailsPage> {
    const detailsPage = new AddContainerDetailsPage(page)
    await expect(detailsPage.heading).toBeVisible()
    return detailsPage
  }

  async completeWith({ seal, type }: { seal: string; type: string }): Promise<void> {
    await this.sealNumber.fill(seal)
    await this.page.getByLabel(type).check()
    await this.page.getByRole('button', { name: 'Save and continue' }).click()
  }
}

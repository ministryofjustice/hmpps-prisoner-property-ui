import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class CombineDetailsPage extends AbstractPage {
  readonly heading: Locator

  readonly sources: Locator

  readonly sealNumber: Locator

  readonly saveAndContinue: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('combine-heading')
    this.sources = page.getByTestId('sources')
    this.sealNumber = page.locator('#sealNumber')
    this.saveAndContinue = page.getByRole('button', { name: 'Save and continue' })
  }

  async completeWith({ seal, type }: { seal: string; type: string }) {
    await this.sealNumber.fill(seal)
    await this.page.getByLabel(type, { exact: true }).check()
    await this.saveAndContinue.click()
  }

  static async verifyOnPage(page: Page): Promise<CombineDetailsPage> {
    const detailsPage = new CombineDetailsPage(page)
    await expect(detailsPage.heading).toBeVisible()
    return detailsPage
  }
}

import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AddContainerWhereStoredPage extends AbstractPage {
  readonly heading: Locator

  readonly continueButton: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: /Where is excess property container/ })
    this.continueButton = page.getByTestId('submit')
  }

  static async verifyOnPage(page: Page): Promise<AddContainerWhereStoredPage> {
    const whereStoredPage = new AddContainerWhereStoredPage(page)
    await expect(whereStoredPage.heading).toBeVisible()
    return whereStoredPage
  }

  async chooseBranston(): Promise<void> {
    await this.page.getByLabel('Off-site at Branston').check()
    await this.continueButton.click()
  }

  async chooseInternal(): Promise<void> {
    await this.page.getByLabel('A location in this prison').check()
    await this.continueButton.click()
  }
}

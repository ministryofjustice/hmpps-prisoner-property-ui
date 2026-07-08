import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class RemoveContainerReasonPage extends AbstractPage {
  readonly heading: Locator

  readonly containerSummary: Locator

  readonly remove: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('remove-container-heading')
    this.containerSummary = page.getByTestId('container-summary')
    this.remove = page.getByTestId('remove-container')
  }

  async chooseReason(label: string) {
    await this.page.getByLabel(label, { exact: true }).check()
  }

  static async verifyOnPage(page: Page): Promise<RemoveContainerReasonPage> {
    const reasonPage = new RemoveContainerReasonPage(page)
    await expect(reasonPage.heading).toBeVisible()
    return reasonPage
  }
}

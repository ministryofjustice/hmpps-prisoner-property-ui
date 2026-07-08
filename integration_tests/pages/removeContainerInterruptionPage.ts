import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class RemoveContainerInterruptionPage extends AbstractPage {
  readonly panel: Locator

  readonly continue: Locator

  readonly returnLink: Locator

  private constructor(page: Page) {
    super(page)
    this.panel = page.getByTestId('interruption')
    this.continue = page.getByTestId('interruption-continue')
    this.returnLink = page.getByTestId('interruption-return')
  }

  static async verifyOnPage(page: Page): Promise<RemoveContainerInterruptionPage> {
    const interruptionPage = new RemoveContainerInterruptionPage(page)
    await expect(interruptionPage.panel).toBeVisible()
    return interruptionPage
  }
}

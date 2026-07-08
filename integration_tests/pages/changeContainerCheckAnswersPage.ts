import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class ChangeContainerCheckAnswersPage extends AbstractPage {
  readonly heading: Locator

  readonly containerSummary: Locator

  readonly confirm: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('check-answers-heading')
    this.containerSummary = page.getByTestId('container-summary')
    this.confirm = page.getByTestId('confirm')
  }

  static async verifyOnPage(page: Page): Promise<ChangeContainerCheckAnswersPage> {
    const checkPage = new ChangeContainerCheckAnswersPage(page)
    await expect(checkPage.heading).toBeVisible()
    return checkPage
  }
}

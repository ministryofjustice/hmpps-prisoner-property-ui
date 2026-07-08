import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class CombineCheckAnswersPage extends AbstractPage {
  readonly heading: Locator

  readonly sources: Locator

  readonly containerSummary: Locator

  readonly confirm: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('check-answers-heading')
    this.sources = page.getByTestId('sources')
    this.containerSummary = page.getByTestId('container-summary')
    this.confirm = page.getByTestId('confirm')
  }

  static async verifyOnPage(page: Page): Promise<CombineCheckAnswersPage> {
    const checkPage = new CombineCheckAnswersPage(page)
    await expect(checkPage.heading).toBeVisible()
    return checkPage
  }
}

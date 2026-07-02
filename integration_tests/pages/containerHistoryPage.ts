import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class ContainerHistoryPage extends AbstractPage {
  readonly heading: Locator

  readonly summary: Locator

  readonly timeline: Locator

  readonly noEvents: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('container-history-heading')
    this.summary = page.getByTestId('container-summary')
    this.timeline = page.getByTestId('container-timeline')
    this.noEvents = page.getByTestId('no-events')
  }

  static async verifyOnPage(page: Page): Promise<ContainerHistoryPage> {
    const historyPage = new ContainerHistoryPage(page)
    await expect(historyPage.heading).toBeVisible()
    return historyPage
  }
}

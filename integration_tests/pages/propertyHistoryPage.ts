import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PropertyHistoryPage extends AbstractPage {
  readonly name: Locator

  readonly banner: Locator

  readonly tabProperty: Locator

  readonly tabHistory: Locator

  readonly timeline: Locator

  readonly noHistory: Locator

  private constructor(page: Page) {
    super(page)
    this.name = page.getByTestId('prisoner-name')
    this.banner = page.getByTestId('prisoner-banner')
    this.tabProperty = page.getByTestId('tab-property')
    this.tabHistory = page.getByTestId('tab-history')
    this.timeline = page.getByTestId('property-timeline')
    this.noHistory = page.getByTestId('no-history')
  }

  static async verifyOnPage(page: Page): Promise<PropertyHistoryPage> {
    const historyPage = new PropertyHistoryPage(page)
    await expect(historyPage.name).toBeVisible()
    return historyPage
  }
}

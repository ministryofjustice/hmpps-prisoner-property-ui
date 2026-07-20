import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PropertyReturnedPage extends AbstractPage {
  readonly name: Locator

  readonly banner: Locator

  readonly tabProperty: Locator

  readonly tabHistory: Locator

  readonly tabReturned: Locator

  readonly list: Locator

  readonly noReturned: Locator

  private constructor(page: Page) {
    super(page)
    this.name = page.getByTestId('prisoner-name')
    this.banner = page.getByTestId('prisoner-banner')
    this.tabProperty = page.getByTestId('tab-property')
    this.tabHistory = page.getByTestId('tab-history')
    this.tabReturned = page.getByTestId('tab-returned')
    this.list = page.getByTestId('returned-list')
    this.noReturned = page.getByTestId('no-returned')
  }

  static async verifyOnPage(page: Page): Promise<PropertyReturnedPage> {
    const returnedPage = new PropertyReturnedPage(page)
    await expect(returnedPage.name).toBeVisible()
    return returnedPage
  }
}

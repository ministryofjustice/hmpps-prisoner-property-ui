import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PrisonerPropertyPage extends AbstractPage {
  readonly name: Locator

  readonly currentEstablishment: Locator

  readonly activeProperty: Locator

  readonly pastProperty: Locator

  readonly noResults: Locator

  readonly addProperty: Locator

  readonly successBanner: Locator

  private constructor(page: Page) {
    super(page)
    this.name = page.getByTestId('prisoner-name')
    this.currentEstablishment = page.getByTestId('current-establishment')
    this.activeProperty = page.getByTestId('active-property')
    this.pastProperty = page.getByTestId('past-property')
    this.noResults = page.getByTestId('no-results')
    this.addProperty = page.getByTestId('add-property')
    this.successBanner = page.getByTestId('success-banner')
  }

  static async verifyOnPage(page: Page): Promise<PrisonerPropertyPage> {
    const prisonerPage = new PrisonerPropertyPage(page)
    await expect(prisonerPage.name).toBeVisible()
    return prisonerPage
  }
}

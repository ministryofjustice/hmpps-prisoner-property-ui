import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PrisonerPropertyPage extends AbstractPage {
  readonly name: Locator

  readonly prisonerEstablishment: Locator

  readonly inEstablishment: Locator

  readonly dueTransferIn: Locator

  readonly leftWarning: Locator

  readonly noResults: Locator

  readonly addProperty: Locator

  readonly successBanner: Locator

  private constructor(page: Page) {
    super(page)
    this.name = page.getByTestId('prisoner-name')
    this.prisonerEstablishment = page.getByTestId('prisoner-establishment')
    this.inEstablishment = page.getByTestId('in-establishment')
    this.dueTransferIn = page.getByTestId('due-transfer-in')
    this.leftWarning = page.getByTestId('left-establishment-warning')
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

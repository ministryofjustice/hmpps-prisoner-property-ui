import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PrisonerPropertyPage extends AbstractPage {
  readonly name: Locator

  readonly banner: Locator

  readonly bannerName: Locator

  readonly bannerPrisonerNumber: Locator

  readonly bannerDob: Locator

  readonly bannerEstablishment: Locator

  readonly bannerCell: Locator

  readonly bannerStatus: Locator

  readonly bannerPhoto: Locator

  readonly inEstablishment: Locator

  readonly dueTransferIn: Locator

  readonly leftWarning: Locator

  readonly noResults: Locator

  readonly addProperty: Locator

  readonly successBanner: Locator

  readonly tabProperty: Locator

  readonly tabHistory: Locator

  readonly breadcrumbs: Locator

  readonly combineButton: Locator

  readonly selectAllHeader: Locator

  private constructor(page: Page) {
    super(page)
    this.name = page.getByTestId('prisoner-name')
    this.banner = page.getByTestId('prisoner-banner')
    this.bannerName = page.getByTestId('banner-name')
    this.bannerPrisonerNumber = page.getByTestId('banner-prisoner-number')
    this.bannerDob = page.getByTestId('banner-dob')
    this.bannerEstablishment = page.getByTestId('banner-establishment')
    this.bannerCell = page.getByTestId('banner-cell')
    this.bannerStatus = page.getByTestId('banner-status')
    this.bannerPhoto = page.getByTestId('banner-photo')
    this.inEstablishment = page.getByTestId('in-establishment')
    this.dueTransferIn = page.getByTestId('due-transfer-in')
    this.leftWarning = page.getByTestId('left-establishment-warning')
    this.noResults = page.getByTestId('no-results')
    this.addProperty = page.getByTestId('add-property')
    this.successBanner = page.getByTestId('success-banner')
    this.tabProperty = page.getByTestId('tab-property')
    this.tabHistory = page.getByTestId('tab-history')
    this.breadcrumbs = page.locator('.govuk-breadcrumbs')
    this.combineButton = page.getByTestId('combine-selected')
    this.selectAllHeader = page.locator('#select-all')
  }

  static async verifyOnPage(page: Page): Promise<PrisonerPropertyPage> {
    const prisonerPage = new PrisonerPropertyPage(page)
    await expect(prisonerPage.name).toBeVisible()
    return prisonerPage
  }
}

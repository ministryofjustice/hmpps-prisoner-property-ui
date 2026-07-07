import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PropertyListPage extends AbstractPage {
  readonly heading: Locator

  readonly searchInput: Locator

  readonly searchButton: Locator

  readonly prisonerHeadings: Locator

  readonly prisonerEstablishments: Locator

  readonly summary: Locator

  readonly noResults: Locator

  readonly breadcrumbs: Locator

  readonly addButton: Locator

  readonly clearSearch: Locator

  readonly filters: Locator

  readonly pagination: Locator

  readonly table: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.locator('h1', { hasText: 'Prisoner property' })
    this.searchInput = page.locator('#q')
    this.searchButton = page.getByRole('button', { name: 'Search' })
    this.prisonerHeadings = page.getByTestId('prisoner-heading')
    this.prisonerEstablishments = page.getByTestId('prisoner-establishment')
    this.summary = page.getByTestId('property-summary')
    this.noResults = page.getByTestId('no-results')
    this.breadcrumbs = page.locator('.govuk-breadcrumbs')
    this.addButton = page.getByTestId('add-container')
    this.clearSearch = page.getByRole('link', { name: 'Clear search' })
    this.filters = page.getByTestId('filters')
    this.pagination = page.locator('.moj-pagination')
    this.table = page.getByTestId('property-list')
  }

  summaryValue(qa: string): Locator {
    return this.page.getByTestId(qa)
  }

  static async verifyOnPage(page: Page): Promise<PropertyListPage> {
    const listPage = new PropertyListPage(page)
    await expect(listPage.heading).toBeVisible()
    return listPage
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term)
    await this.searchButton.click()
  }
}

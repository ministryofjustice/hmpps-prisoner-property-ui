import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class PropertyListPage extends AbstractPage {
  readonly heading: Locator

  readonly searchInput: Locator

  readonly searchButton: Locator

  readonly prisonerHeadings: Locator

  readonly noResults: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.locator('h1', { hasText: 'Prisoner property' })
    this.searchInput = page.locator('#q')
    this.searchButton = page.getByRole('button', { name: 'Search' })
    this.prisonerHeadings = page.getByTestId('prisoner-heading')
    this.noResults = page.getByTestId('no-results')
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

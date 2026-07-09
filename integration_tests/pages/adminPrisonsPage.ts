import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AdminPrisonsPage extends AbstractPage {
  readonly heading: Locator

  readonly activeCount: Locator

  readonly table: Locator

  readonly successBanner: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: 'Manage enabled prisons' })
    this.activeCount = page.getByTestId('active-count')
    this.table = page.getByTestId('prisons-table')
    this.successBanner = page.getByTestId('success-banner')
  }

  status(agencyId: string): Locator {
    return this.page.getByTestId(`status-${agencyId}`)
  }

  toggle(agencyId: string): Locator {
    return this.page.getByTestId(`toggle-${agencyId}`)
  }

  static async verifyOnPage(page: Page): Promise<AdminPrisonsPage> {
    const adminPage = new AdminPrisonsPage(page)
    await expect(adminPage.heading).toBeVisible()
    return adminPage
  }
}

import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AdminCleanupJobPage extends AbstractPage {
  readonly heading: Locator

  readonly status: Locator

  readonly progress: Locator

  readonly returned: Locator

  readonly transferred: Locator

  readonly skipped: Locator

  readonly inProgress: Locator

  readonly attentionTable: Locator

  readonly successBanner: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: 'Legacy property clean-up' })
    this.status = page.getByTestId('job-status')
    this.progress = page.getByTestId('progress')
    this.returned = page.getByTestId('returned')
    this.transferred = page.getByTestId('transferred')
    this.skipped = page.getByTestId('skipped')
    this.inProgress = page.getByTestId('in-progress')
    this.attentionTable = page.getByTestId('attention-table')
    this.successBanner = page.getByTestId('success-banner')
  }

  static async verifyOnPage(page: Page): Promise<AdminCleanupJobPage> {
    const jobPage = new AdminCleanupJobPage(page)
    await expect(jobPage.heading).toBeVisible()
    return jobPage
  }
}

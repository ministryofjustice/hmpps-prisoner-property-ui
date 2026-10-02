import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AdminCleanupPreviewPage extends AbstractPage {
  readonly heading: Locator

  readonly cutoff: Locator

  readonly toRemove: Locator

  readonly removalReasons: Locator

  readonly dueForReturnNow: Locator

  readonly dueForTransferOutNow: Locator

  readonly warning: Locator

  readonly runCleanup: Locator

  readonly inFlight: Locator

  readonly errorBanner: Locator

  readonly jobsTable: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: 'Clean up legacy property' })
    this.cutoff = page.getByTestId('cutoff')
    this.toRemove = page.getByTestId('to-remove')
    this.removalReasons = page.getByTestId('removal-reasons')
    this.dueForReturnNow = page.getByTestId('due-for-return-now')
    this.dueForTransferOutNow = page.getByTestId('due-for-transfer-out-now')
    this.warning = page.getByTestId('warning')
    this.runCleanup = page.getByTestId('run-cleanup')
    this.inFlight = page.getByTestId('in-flight')
    this.errorBanner = page.getByTestId('error-banner')
    this.jobsTable = page.getByTestId('jobs-table')
  }

  static async verifyOnPage(page: Page): Promise<AdminCleanupPreviewPage> {
    const previewPage = new AdminCleanupPreviewPage(page)
    await expect(previewPage.heading).toBeVisible()
    return previewPage
  }
}

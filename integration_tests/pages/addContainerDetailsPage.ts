import { expect, type Locator, type Page } from '@playwright/test'
import AbstractPage from './abstractPage'

export default class AddContainerDetailsPage extends AbstractPage {
  readonly heading: Locator

  readonly sealNumber: Locator

  readonly errorSummary: Locator

  private constructor(page: Page) {
    super(page)
    this.heading = page.getByTestId('add-container-heading')
    this.sealNumber = page.locator('#containers-0-sealNumber')
    this.errorSummary = page.locator('.govuk-error-summary')
  }

  static async verifyOnPage(page: Page): Promise<AddContainerDetailsPage> {
    const detailsPage = new AddContainerDetailsPage(page)
    await expect(detailsPage.heading).toBeVisible()
    return detailsPage
  }

  // Fill the container at `index` (0-based). `type` is the label (e.g. "Valuables"), whose value is the
  // uppercased enum; radio labels repeat across blocks so we target by the input's name + value.
  async fillContainer(index: number, { seal, type }: { seal: string; type: string }): Promise<void> {
    await this.page.locator(`#containers-${index}-sealNumber`).fill(seal)
    await this.page.locator(`input[name="containers[${index}][containerType]"][value="${type.toUpperCase()}"]`).check()
  }

  async addAnother(): Promise<void> {
    await this.page.getByTestId('add-another').click()
  }

  async saveAndContinue(): Promise<void> {
    await this.page.getByTestId('save-and-continue').click()
  }

  async completeWith({ seal, type }: { seal: string; type: string }): Promise<void> {
    await this.fillContainer(0, { seal, type })
    await this.saveAndContinue()
  }
}

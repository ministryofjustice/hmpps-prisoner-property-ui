import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import PropertyReturnedPage from '../pages/propertyReturnedPage'
import type { PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'

const container = (overrides: Partial<PrisonerPropertyContainer> = {}): PrisonerPropertyContainer => ({
  id: 'c1',
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  inPrisonersCurrentPrison: true,
  containerType: 'STANDARD',
  currentSealNumber: 'SN0001',
  currentStatus: 'STORED',
  currentLocation: null,
  currentLocationType: 'INTERNAL',
  locationDescription: 'Reception A1',
  proposedDisposalDate: null,
  removalOutcome: null,
  removalDate: null,
  createDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
  ...overrides,
})

const containers: PrisonerPropertyContainer[] = [
  container({ id: 'active', currentSealNumber: 'ACTIVE1', removalOutcome: null }),
  container({
    id: 'returned',
    currentSealNumber: 'RET1',
    prisonName: 'Leeds (HMP)',
    removalOutcome: 'RETURNED',
    currentStatus: 'RETURNED',
    removalDate: '2026-06-10',
  }),
  container({
    id: 'transferred',
    currentSealNumber: 'TR1',
    removalOutcome: 'TRANSFERRED',
    currentStatus: 'TRANSFER',
    removalDate: '2026-06-20',
  }),
]

test.describe('Property returned or transferred', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('switches to the tab and lists returned/transferred property with status tags', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ prisonerNumber: 'A1234BC', containers, priority: 1 })
    await page.goto('/prisoner/A1234BC')

    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(prisonerPage.tabReturned).toBeVisible()
    await prisonerPage.tabReturned.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC\/returned$/)
    const returnedPage = await PropertyReturnedPage.verifyOnPage(page)

    await expect(returnedPage.list).toBeVisible()
    await expect(returnedPage.list).toContainText('RET1')
    await expect(returnedPage.list).toContainText('Returned')
    await expect(returnedPage.list).toContainText('TR1')
    await expect(returnedPage.list).toContainText('Transferred out')
    // active property is not shown on this tab
    await expect(returnedPage.list).not.toContainText('ACTIVE1')
  })

  test('shows an empty state when the prisoner has no returned or transferred property', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [container({ removalOutcome: null })],
      priority: 1,
    })
    await page.goto('/prisoner/A1234BC/returned')

    const returnedPage = await PropertyReturnedPage.verifyOnPage(page)
    await expect(returnedPage.noReturned).toBeVisible()
  })
})

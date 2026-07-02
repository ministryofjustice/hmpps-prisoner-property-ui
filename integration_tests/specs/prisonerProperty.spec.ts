import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PropertyListPage from '../pages/propertyListPage'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import type { PrisonerPropertyContainer, PrisonerPropertyGroup } from '../../server/data/prisonerPropertyApiTypes'

const activeContainer: PrisonerPropertyContainer = {
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
  archived: false,
}

const pastContainer: PrisonerPropertyContainer = {
  ...activeContainer,
  id: 'c2',
  prisonName: 'Leeds (HMP)',
  inPrisonersCurrentPrison: false,
  containerType: 'VALUABLES',
  currentSealNumber: 'SN0002',
  currentStatus: 'RETURNED',
  locationDescription: null,
  removalOutcome: 'RETURNED',
  removalDate: '2026-06-20',
}

const group: PrisonerPropertyGroup = {
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonerCurrentPrisonId: 'MDI',
  prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
  containers: [activeContainer],
}

test.describe('Person property view', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('drills down from the establishment list to a prisoners current and past property', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [activeContainer, pastContainer],
      priority: 1,
    })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.prisonerHeadings.getByRole('link', { name: /John Smith/ }).click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)

    await expect(prisonerPage.name).toContainText('John Smith')
    await expect(prisonerPage.name).toContainText('A1234BC')
    await expect(prisonerPage.currentEstablishment).toContainText('Moorland (HMP & YOI)')

    await expect(prisonerPage.activeProperty.getByRole('cell', { name: 'SN0001' })).toBeVisible()
    await expect(prisonerPage.activeProperty.getByRole('cell', { name: 'Reception A1' })).toBeVisible()

    await expect(prisonerPage.pastProperty.getByRole('cell', { name: 'SN0002' })).toBeVisible()
    await expect(prisonerPage.pastProperty.getByRole('cell', { name: 'Returned' })).toBeVisible()
  })

  test('shows an empty state when the prisoner has no property', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ prisonerNumber: 'A1234BC', containers: [], priority: 1 })
    await page.goto('/prisoner/A1234BC')

    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(prisonerPage.noResults).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PropertyListPage from '../pages/propertyListPage'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import type { PrisonerPropertyContainer, PrisonerPropertyGroup } from '../../server/data/prisonerPropertyApiTypes'

// The signed-in user's active caseload is MDI (Moorland) from login().
const inEstablishmentContainer: PrisonerPropertyContainer = {
  id: 'c1',
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  prisonerCurrentPrisonId: 'MDI',
  prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
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

// Held at Leeds, but the prisoner is now at MDI -> due to be transferred in (from MDI's perspective).
const transferInContainer: PrisonerPropertyContainer = {
  ...inEstablishmentContainer,
  id: 'c2',
  prisonId: 'LEI',
  prisonName: 'Leeds (HMP)',
  inPrisonersCurrentPrison: false,
  containerType: 'VALUABLES',
  currentSealNumber: 'SN0002',
  currentStatus: 'DUE_FOR_TRANSFER_OUT',
}

const group: PrisonerPropertyGroup = {
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonerCurrentPrisonId: 'MDI',
  prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
  containers: [inEstablishmentContainer],
}

test.describe('Person property view', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('variant A: prisoner is here - property in this establishment plus property due to transfer in', async ({
    page,
  }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [inEstablishmentContainer, transferInContainer],
      priority: 1,
    })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.prisonerHeadings.getByRole('link', { name: /John Smith/ }).click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)

    await expect(prisonerPage.name).toContainText('John Smith')
    await expect(prisonerPage.leftWarning).toBeHidden()

    await expect(prisonerPage.inEstablishment.getByRole('cell', { name: 'SN0001' })).toBeVisible()
    await expect(prisonerPage.inEstablishment.getByRole('cell', { name: 'Stored' })).toBeVisible()

    await expect(prisonerPage.dueTransferIn.getByRole('cell', { name: 'SN0002' })).toBeVisible()
    await expect(prisonerPage.dueTransferIn.getByRole('cell', { name: 'Leeds (HMP)' })).toBeVisible()
    await expect(prisonerPage.dueTransferIn.getByRole('cell', { name: 'Due for transfer in' })).toBeVisible()
  })

  test('variant B: prisoner has left - warning, due for transfer out and prisoner establishment column', async ({
    page,
  }) => {
    const leftBehind: PrisonerPropertyContainer = {
      ...inEstablishmentContainer,
      id: 'c3',
      prisonId: 'MDI',
      prisonerCurrentPrisonId: 'IWI',
      prisonerCurrentPrisonName: 'Isle of Wight (HMP)',
      inPrisonersCurrentPrison: false,
      currentSealNumber: 'SN0003',
      currentStatus: 'DUE_FOR_TRANSFER_OUT',
    }
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [leftBehind],
      priority: 1,
    })
    await page.goto('/prisoner/A1234BC')

    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(prisonerPage.leftWarning).toContainText('no longer in this establishment')
    await expect(prisonerPage.inEstablishment.getByRole('cell', { name: 'SN0003' })).toBeVisible()
    await expect(prisonerPage.inEstablishment.getByRole('cell', { name: 'Due for transfer out' })).toBeVisible()
    await expect(prisonerPage.inEstablishment.getByRole('cell', { name: 'Isle of Wight (HMP)' })).toBeVisible()
    await expect(prisonerPage.dueTransferIn).toBeHidden()
  })

  test('shows an empty state when the prisoner has no property', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ prisonerNumber: 'A1234BC', containers: [], priority: 1 })
    await page.goto('/prisoner/A1234BC')

    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(prisonerPage.noResults).toBeVisible()
  })
})

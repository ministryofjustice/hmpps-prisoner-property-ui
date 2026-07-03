import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import manageUsersApi from '../mockApis/manageUsersApi'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import PropertyListPage from '../pages/propertyListPage'
import type { PrisonerPropertyGroup } from '../../server/data/prisonerPropertyApiTypes'

const group: PrisonerPropertyGroup = {
  prisonerNumber: 'A1234BC',
  prisonerName: 'John Smith',
  prisonerCurrentPrisonId: 'LEI',
  prisonerCurrentPrisonName: 'Leeds (HMP)',
  containers: [
    {
      id: 'c1',
      prisonerNumber: 'A1234BC',
      prisonerName: 'John Smith',
      prisonId: 'MDI',
      prisonName: 'Moorland (HMP & YOI)',
      inPrisonersCurrentPrison: false,
      containerType: 'VALUABLES',
      currentSealNumber: 'SN8842K1',
      currentStatus: 'DISPOSAL_REQUIRED',
      currentLocation: null,
      currentLocationType: 'BRANSTON',
      locationDescription: null,
      proposedDisposalDate: null,
      removalOutcome: null,
      removalDate: null,
      createDateTime: '2026-06-01T10:00:00',
      createdByUserId: 'AUSER',
      archived: false,
    },
  ],
}

test.describe('Establishment property list', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('shows property grouped by prisoner with status tags for the active caseload', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)

    await expect(listPage.heading).toContainText('Moorland (HMP & YOI)')
    await expect(listPage.prisonerHeadings).toContainText('John Smith')
    await expect(listPage.prisonerHeadings).toContainText('A1234BC')
    await expect(listPage.prisonerHeadings.getByRole('link', { name: /John Smith/ })).toHaveAttribute(
      'href',
      '/prisoner/A1234BC',
    )
    await expect(page.getByRole('cell', { name: 'SN8842K1' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Valuables' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Branston (offsite)' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Due for disposal' })).toBeVisible()
  })

  test('keeps a prisoner and all their containers together in one grouped row-set', async ({ page }) => {
    const multiContainer: PrisonerPropertyGroup = {
      ...group,
      containers: [
        group.containers[0]!,
        {
          ...group.containers[0]!,
          id: 'c2',
          containerType: 'STANDARD',
          currentSealNumber: 'SN0002',
          currentStatus: 'DUE_FOR_TRANSFER_OUT',
          currentLocationType: 'INTERNAL',
          locationDescription: 'Reception A2',
        },
      ],
    }
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [multiContainer], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    // The name link is shown once for the person (row-spanned across their two containers).
    await expect(listPage.prisonerHeadings.getByRole('link', { name: /John Smith/ })).toHaveCount(1)
    await expect(page.getByRole('cell', { name: 'SN8842K1' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'SN0002' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Due for transfer out' })).toBeVisible()
  })

  test('lets a user search by prison number', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.search('A1234BC')

    await expect(page).toHaveURL(/q=A1234BC/)
    await expect(listPage.noResults).toBeVisible()
  })

  test('shows the no-caseload page and no property when the user has no active caseload', async ({ page }) => {
    await login(page)
    await manageUsersApi.stubGetMyCaseloads(null, 1)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'You do not have an active caseload' })).toBeVisible()
  })
})

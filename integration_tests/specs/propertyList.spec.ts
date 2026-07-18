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
    },
  ],
}

test.describe('Establishment property list', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('shows the summary tiles with whole-prison counts', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [], priority: 1 })
    await prisonerPropertyApi.stubGetPrisonPropertySummary({
      prisonId: 'MDI',
      summary: {
        availableStorageSpaces: 150,
        storedOnSite: 3000,
        dueToTransferOut: 80,
        dueToBeReturned: 70,
        dueToBeDisposed: 40,
      },
      priority: 1,
    })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.summary).toBeVisible()
    await expect(listPage.summaryValue('summary-available-spaces')).toHaveText('150')
    await expect(listPage.summaryValue('summary-stored')).toHaveText('3000')
    await expect(listPage.summaryValue('summary-transfer-out')).toHaveText('80')
    await expect(listPage.summaryValue('summary-returned')).toHaveText('70')
    await expect(listPage.summaryValue('summary-disposed')).toHaveText('40')
  })

  test('describes a released prisoner in the establishment column', async ({ page }) => {
    const released: PrisonerPropertyGroup = {
      ...group,
      prisonerCurrentPrisonId: 'OUT',
      prisonerCurrentPrisonName: null,
      prisonerMovementStatus: 'RELEASED',
    }
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [released], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.prisonerEstablishments).toContainText('Released')
  })

  test('shows property grouped by prisoner with status tags for the active caseload', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)

    // The heading is just "Prisoner property" - no establishment name appended (MAPB-642).
    await expect(listPage.heading).toHaveText('Prisoner property')
    await expect(listPage.heading).not.toContainText('Moorland (HMP & YOI)')
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

  test('renders a Due for return tag for a released prisoner’s property', async ({ page }) => {
    const dueForReturn: PrisonerPropertyGroup = {
      ...group,
      containers: [{ ...group.containers[0]!, currentStatus: 'DUE_FOR_RETURN' }],
    }
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [dueForReturn], priority: 1 })
    await page.goto('/')

    await PropertyListPage.verifyOnPage(page)
    await expect(page.getByRole('cell', { name: 'Due for return' })).toBeVisible()
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

  test('shows a breadcrumb back to Digital Prison Services', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.breadcrumbs.getByRole('link', { name: 'Digital Prison Services' })).toBeVisible()
    await expect(listPage.breadcrumbs).toContainText('Prisoner property')
  })

  test('renders pagination above and below the table', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.pagination).toHaveCount(2)
  })

  test('exposes the filter groups as real, submittable checkboxes', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.filters.locator('summary').click() // expand the collapsed filters
    // Property type + the mapped statuses are real, submittable checkboxes.
    await expect(listPage.filters.getByRole('checkbox', { name: 'Standard' })).toBeEnabled()
    await expect(listPage.filters.getByRole('checkbox', { name: 'Due for return' })).toBeEnabled()
    await expect(listPage.filters.getByRole('checkbox', { name: 'Due for transfer out' })).toBeEnabled()
    await expect(listPage.filters.getByRole('checkbox', { name: 'Due for disposal' })).toBeEnabled()
    // Removed/returned/disposed is wired to the API's includeRemoved flag.
    await expect(
      listPage.filters.getByRole('checkbox', { name: 'Show property that has been removed, returned or disposed of' }),
    ).toBeEnabled()
    // Person-location filters are enabled.
    await expect(
      listPage.filters.getByRole('checkbox', { name: 'Property for people in this establishment' }),
    ).toBeEnabled()
    await expect(
      listPage.filters.getByRole('checkbox', { name: 'Property for people no longer in this establishment' }),
    ).toBeEnabled()
    // "Due for transfer in" is now backed by the API's receiving-prison view.
    await expect(listPage.filters.getByRole('checkbox', { name: 'Due for transfer in' })).toBeEnabled()
  })

  test('surfaces incoming property with a Due for transfer in tag when the filter is applied', async ({ page }) => {
    // Held at another prison (LEI) but its owner is now at the viewed establishment (MDI), so it is due
    // to be transferred in. The API reports it as DUE_FOR_TRANSFER_OUT; the list relabels it for MDI.
    const incoming: PrisonerPropertyGroup = {
      ...group,
      prisonerCurrentPrisonId: 'MDI',
      prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
      containers: [
        {
          ...group.containers[0]!,
          prisonId: 'LEI',
          prisonName: 'Leeds (HMP)',
          currentStatus: 'DUE_FOR_TRANSFER_OUT',
          currentLocationType: 'INTERNAL',
        },
      ],
    }
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [incoming], priority: 1 })
    await page.goto('/?status=DUE_FOR_TRANSFER_IN')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(page.getByRole('cell', { name: 'Due for transfer in' })).toBeVisible()
    await listPage.filters.locator('summary').click()
    await expect(listPage.filters.getByRole('checkbox', { name: 'Due for transfer in' })).toBeChecked()
  })

  test('keeps the person-location filter ticked when applied', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/?personLocation=IN_ESTABLISHMENT')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.filters.locator('summary').click() // expand the collapsed filters
    await expect(
      listPage.filters.getByRole('checkbox', { name: 'Property for people in this establishment' }),
    ).toBeChecked()
    await expect(
      listPage.filters.getByRole('checkbox', { name: 'Property for people no longer in this establishment' }),
    ).not.toBeChecked()
  })

  test('shows the Add button and per-row actions for a user with the manage role', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.addButton).toBeVisible()
    await expect(listPage.table.getByRole('columnheader', { name: 'Actions' })).toBeVisible()
    await expect(listPage.table.getByRole('link', { name: 'Change' })).toBeVisible()
    await expect(listPage.table.getByRole('link', { name: 'Remove' })).toBeVisible()
  })

  test('hides the Add button and actions from a user without the manage role', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [group], priority: 1 })
    await page.goto('/')

    const listPage = await PropertyListPage.verifyOnPage(page)
    await expect(listPage.addButton).toBeHidden()
    await expect(listPage.table.getByRole('columnheader', { name: 'Actions' })).toBeHidden()
  })

  test('shows the no-caseload page and no property when the user has no active caseload', async ({ page }) => {
    await login(page)
    await manageUsersApi.stubGetMyCaseloads(null, 1)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'You do not have an active caseload' })).toBeVisible()
  })
})

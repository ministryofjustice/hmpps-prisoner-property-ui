import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import AdminPrisonsPage from '../pages/adminPrisonsPage'
import type { AgencyStatus } from '../../server/data/prisonerPropertyApiTypes'

const agencies: AgencyStatus[] = [
  { agencyId: 'LEI', name: 'Leeds (HMP)', active: false },
  { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true },
]

test.describe('Admin - manage enabled prisons', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('lists every prison with its on/off state', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await page.goto('/admin/prisons')

    const adminPage = await AdminPrisonsPage.verifyOnPage(page)
    await expect(adminPage.activeCount).toHaveText('Property is switched on for 1 of 2 prisons.')
    await expect(adminPage.status('MDI')).toHaveText('On')
    await expect(adminPage.status('LEI')).toHaveText('Off')
    await expect(adminPage.toggle('MDI')).toHaveText('Turn off')
    await expect(adminPage.toggle('LEI')).toHaveText('Turn on')
  })

  test('switching a prison on shows a confirmation banner and the new state', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies, priority: 2 })
    await page.goto('/admin/prisons')

    const adminPage = await AdminPrisonsPage.verifyOnPage(page)

    // The toggle POSTs, then the redirect re-reads the list - stub the updated state (LEI now on).
    await prisonerPropertyApi.stubSetAgencyActive({ agencyId: 'LEI', active: true })
    await prisonerPropertyApi.stubGetAllAgencies({
      agencies: [
        { agencyId: 'LEI', name: 'Leeds (HMP)', active: true },
        { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true },
      ],
      priority: 1,
    })
    await adminPage.toggle('LEI').click()

    await expect(adminPage.successBanner).toContainText('Property is now switched on for Leeds (HMP).')
    await expect(adminPage.status('LEI')).toHaveText('On')
    await expect(adminPage.activeCount).toHaveText('Property is switched on for 2 of 2 prisons.')
  })

  test('denies access to a user without the admin role', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await page.goto('/admin/prisons')

    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

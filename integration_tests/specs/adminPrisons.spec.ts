import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import prisonApi from '../mockApis/prisonApi'
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

  test('lists every prison with its DPS and NOMIS state', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await prisonApi.stubGetSplashScreen({
      conditions: [{ conditionType: 'CASELOAD', conditionValue: 'LEI', blockAccess: true }],
    })
    await page.goto('/admin/prisons')

    const adminPage = await AdminPrisonsPage.verifyOnPage(page)
    await expect(adminPage.activeCount).toHaveText('Property is switched on for 1 of 2 prisons.')
    await expect(adminPage.status('MDI')).toHaveText('On')
    await expect(adminPage.status('LEI')).toHaveText('Off')
    await expect(adminPage.toggle('MDI')).toHaveText('Turn off')
    await expect(adminPage.toggle('LEI')).toHaveText('Turn on')
    // NOMIS: LEI blocked, MDI has no condition so is normal
    await expect(adminPage.nomisStatus('LEI')).toHaveText('Blocked')
    await expect(adminPage.nomisStatus('MDI')).toHaveText('Normal')
  })

  test('blocks the NOMIS property screen for a prison and shows the new state', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies, priority: 1 })
    await prisonApi.stubGetSplashScreen({ conditions: [], priority: 2 })
    await prisonApi.stubAddSplashCondition()
    await page.goto('/admin/prisons')

    const adminPage = await AdminPrisonsPage.verifyOnPage(page)
    await expect(adminPage.nomisStatus('MDI')).toHaveText('Normal')

    // The POST redirects and re-reads the screen - stub MDI as now blocked at a higher priority.
    await prisonApi.stubGetSplashScreen({
      conditions: [{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true }],
      priority: 1,
    })
    await adminPage.nomisBlock('MDI').click()

    await expect(adminPage.successBanner).toContainText(
      'NOMIS property access is now blocked for Moorland (HMP & YOI).',
    )
    await expect(adminPage.nomisStatus('MDI')).toHaveText('Blocked')
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

import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi, { legacyCleanupJob } from '../mockApis/prisonerPropertyApi'
import AdminPrisonsPage from '../pages/adminPrisonsPage'
import AdminCleanupPreviewPage from '../pages/adminCleanupPreviewPage'
import AdminCleanupJobPage from '../pages/adminCleanupJobPage'
import type { AgencyStatus } from '../../server/data/prisonerPropertyApiTypes'

const agencies: AgencyStatus[] = [
  { agencyId: 'LEI', name: 'Leeds (HMP)', active: false },
  { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true },
]

test.describe('Admin - clean up legacy property', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('previews what a clean-up would close, then runs it and follows the job to completion', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await prisonerPropertyApi.stubGetLegacyCleanupJobs({ agencyId: 'LEI', jobs: [] })
    await prisonerPropertyApi.stubPreviewLegacyCleanup({ agencyId: 'LEI' })
    await page.goto('/admin/prisons')

    // Reached from the row on the admin console.
    const adminPage = await AdminPrisonsPage.verifyOnPage(page)
    await page.getByTestId('cleanup-LEI').click()
    await expect(adminPage.heading).toBeHidden()

    const preview = await AdminCleanupPreviewPage.verifyOnPage(page)
    await expect(preview.olderThanDays).toHaveValue('28')
    await expect(preview.toReturn).toHaveText('412 containers')
    await expect(preview.toTransfer).toHaveText('96 containers')
    await expect(preview.dueForReturnNow).toHaveText('430 containers')
    await expect(preview.dueForTransferOutNow).toHaveText('120 containers')
    await expect(preview.warning).toContainText('508 containers will be closed')
    await expect(page.getByTestId('ineligible')).toContainText('The person is at this prison')

    // Running it: 202 lands on the job page, which is still in progress at first...
    const job = legacyCleanupJob('LEI')
    await prisonerPropertyApi.stubStartLegacyCleanup({ agencyId: 'LEI' })
    await prisonerPropertyApi.stubGetLegacyCleanupJob({
      job: {
        ...job,
        status: 'STARTED',
        startTime: '2026-09-11T10:00:05',
        processedRecords: 120,
        returnedRecords: 100,
        transferredRecords: 20,
      },
      priority: 5,
    })
    await preview.runCleanup.click()

    const jobPage = await AdminCleanupJobPage.verifyOnPage(page)
    await expect(jobPage.successBanner).toContainText('Clean-up started for Leeds (HMP): 508 containers queued.')
    await expect(jobPage.status).toHaveText('In progress')
    await expect(jobPage.progress).toHaveText('120 of 508 containers (24%)')
    await expect(jobPage.inProgress).toBeVisible()

    // ...and finishes on the next automatic reload.
    await prisonerPropertyApi.stubGetLegacyCleanupJob({
      job: {
        ...job,
        status: 'FINISHED',
        startTime: '2026-09-11T10:00:05',
        endTime: '2026-09-11T10:04:40',
        processedRecords: 508,
        returnedRecords: 410,
        transferredRecords: 96,
        skippedRecords: 2,
        items: [
          {
            containerId: 'c1',
            prisonerNumber: 'A1234AA',
            action: 'RETURN',
            plannedEventDate: '2026-06-01',
            plannedToPrisonId: null,
            status: 'SKIPPED',
            message: 'already removed: Property container has already left active storage (RETURNED)',
            processedAt: '2026-09-11T10:01:00',
          },
          {
            containerId: 'c2',
            prisonerNumber: 'B2345BB',
            action: 'RETURN',
            plannedEventDate: '2026-06-01',
            plannedToPrisonId: null,
            status: 'SKIPPED',
            message: 'no longer eligible: OWNER_HERE',
            processedAt: '2026-09-11T10:01:00',
          },
        ],
      },
      priority: 1,
    })
    await expect(jobPage.status).toHaveText('Finished', { timeout: 10_000 })
    await expect(jobPage.progress).toHaveText('508 of 508 containers (100%)')
    await expect(jobPage.returned).toHaveText('410')
    await expect(jobPage.transferred).toHaveText('96')
    await expect(jobPage.skipped).toHaveText('2')
    await expect(jobPage.inProgress).toBeHidden()
    await expect(jobPage.attentionTable).toContainText('B2345BB')
    await expect(jobPage.attentionTable).toContainText('no longer eligible: OWNER_HERE')
  })

  test('a clean-up already in flight is refused and the preview says so', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await prisonerPropertyApi.stubGetLegacyCleanupJobs({ agencyId: 'LEI', jobs: [] })
    await prisonerPropertyApi.stubPreviewLegacyCleanup({ agencyId: 'LEI' })
    await prisonerPropertyApi.stubStartLegacyCleanup({ agencyId: 'LEI' }, 409)
    await page.goto('/admin/prisons/LEI/cleanup')

    const preview = await AdminCleanupPreviewPage.verifyOnPage(page)
    await preview.runCleanup.click()

    await expect(preview.errorBanner).toContainText('A clean-up is already running for this prison.')
  })

  test('a running job hides the run button and links to its progress', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await prisonerPropertyApi.stubGetLegacyCleanupJobs({
      agencyId: 'LEI',
      jobs: [{ ...legacyCleanupJob('LEI'), status: 'STARTED' }],
    })
    await prisonerPropertyApi.stubPreviewLegacyCleanup({ agencyId: 'LEI' })
    await page.goto('/admin/prisons/LEI/cleanup')

    const preview = await AdminCleanupPreviewPage.verifyOnPage(page)
    await expect(preview.inFlight).toBeVisible()
    await expect(preview.runCleanup).toBeHidden()
    await expect(preview.jobsTable).toContainText('In progress')
  })

  test('rejects a window that is not a number of days', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__ADMIN'] })
    await prisonerPropertyApi.stubGetAllAgencies({ agencies })
    await prisonerPropertyApi.stubGetLegacyCleanupJobs({ agencyId: 'LEI', jobs: [] })
    await page.goto('/admin/prisons/LEI/cleanup?olderThanDays=lots')

    const preview = await AdminCleanupPreviewPage.verifyOnPage(page)
    await expect(preview.errorSummary).toContainText('Enter a whole number of days between 1 and 3650')
    await expect(preview.runCleanup).toBeHidden()
  })

  test('is not available without the admin role', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await page.goto('/admin/prisons/LEI/cleanup')

    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

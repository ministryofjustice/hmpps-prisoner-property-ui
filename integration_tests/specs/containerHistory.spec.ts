import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import manageUsersApi from '../mockApis/manageUsersApi'
import ContainerHistoryPage from '../pages/containerHistoryPage'
import type { PrisonerPropertyContainer, PropertyEvent } from '../../server/data/prisonerPropertyApiTypes'

const container: PrisonerPropertyContainer = {
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

const events: PropertyEvent[] = [
  {
    id: 'e2',
    eventType: 'MOVED',
    eventDateTime: '2026-06-02T14:30:00',
    eventUserId: 'BUSER',
    sealNumber: null,
    fromInternalLocationId: null,
    toInternalLocationId: null,
    toStorageLocationType: 'BRANSTON',
    fromPrisonId: null,
    toPrisonId: null,
    eventDate: null,
    relatedContainerId: null,
  },
  {
    id: 'e1',
    eventType: 'CREATED_SEALED',
    eventDateTime: '2026-06-01T10:00:00',
    eventUserId: 'AUSER',
    sealNumber: 'SN0001',
    fromInternalLocationId: null,
    toInternalLocationId: null,
    toStorageLocationType: null,
    fromPrisonId: null,
    toPrisonId: null,
    eventDate: null,
    relatedContainerId: null,
  },
]

test.describe('Container history timeline', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('renders a container timeline', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [container],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetContainerEvents({ id: 'c1', events, priority: 1 })
    await manageUsersApi.stubGetUser({ username: 'AUSER', name: 'John Doe' })
    await manageUsersApi.stubGetUser({ username: 'BUSER', name: 'Brian User' })
    await page.goto('/prisoner/A1234BC/container/c1')

    const historyPage = await ContainerHistoryPage.verifyOnPage(page)

    await expect(historyPage.summary).toContainText('SN0001')
    await expect(historyPage.summary).toContainText('A1234BC')
    await expect(historyPage.timeline).toContainText('Moved')
    await expect(historyPage.timeline).toContainText('Moved to Branston (offsite)')
    await expect(historyPage.timeline).toContainText('Created and sealed')
    // the acting users are resolved to their names, not the raw usernames
    await expect(historyPage.timeline).toContainText('by John Doe')
    await expect(historyPage.timeline).toContainText('by Brian User')
    await expect(historyPage.timeline).not.toContainText('by AUSER')
  })

  test('shows an empty state when the container has no events', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [container],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetContainerEvents({ id: 'c1', events: [], priority: 1 })
    await page.goto('/prisoner/A1234BC/container/c1')

    const historyPage = await ContainerHistoryPage.verifyOnPage(page)
    await expect(historyPage.noEvents).toBeVisible()
  })
})

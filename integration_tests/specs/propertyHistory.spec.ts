import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import manageUsersApi from '../mockApis/manageUsersApi'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import PropertyHistoryPage from '../pages/propertyHistoryPage'
import type { PrisonerPropertyContainer, PrisonerTimelineItem } from '../../server/data/prisonerPropertyApiTypes'

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

const timelineItem = (overrides: Partial<PrisonerTimelineItem> = {}): PrisonerTimelineItem => ({
  itemType: 'CONTAINER_EVENT',
  movementKind: null,
  propertySystem: null,
  eventId: 'e1',
  eventType: 'CREATED_SEALED',
  eventStatus: 'STORED',
  eventDateTime: '2026-06-01T10:00:00',
  eventDate: null,
  eventUserId: 'AUSER',
  systemGenerated: false,
  prisonerName: null,
  actingEstablishmentName: 'Leeds (HMP)',
  fromPrisonName: null,
  toPrisonName: null,
  toStorageLocationType: null,
  sealNumber: 'SN880032',
  relatedContainerId: null,
  relatedContainerSealNumber: null,
  containerId: 'c1',
  containerType: 'VALUABLES',
  containerSealNumber: 'SN880032',
  containerStatus: 'STORED',
  containerLocationDescription: 'Reception A1',
  ...overrides,
})

const items: PrisonerTimelineItem[] = [
  timelineItem({
    eventId: 'e3',
    eventType: 'TRANSFERRED',
    eventStatus: 'TRANSFER',
    eventDateTime: '2026-06-03T09:00:00',
    toPrisonName: 'Isle of Wight (HMP)',
  }),
  timelineItem({
    eventId: 'e2',
    itemType: 'PRISONER_MOVEMENT',
    movementKind: 'ADMISSION',
    propertySystem: 'NOMIS',
    eventType: null,
    eventStatus: null,
    eventDateTime: '2026-06-02T14:30:00',
    systemGenerated: true,
    prisonerName: 'JOHN SMITH',
    actingEstablishmentName: 'Isle of Wight (HMP)',
    toPrisonName: 'Isle of Wight (HMP)',
    sealNumber: null,
    containerId: null,
    containerType: null,
    containerSealNumber: null,
    containerStatus: null,
    containerLocationDescription: null,
  }),
  timelineItem({ eventId: 'e1' }),
  timelineItem({
    eventId: 'dps1',
    itemType: 'DPS_FIRST_USED',
    eventType: null,
    eventStatus: null,
    eventDateTime: '2026-05-01T00:00:00',
    eventDate: '2026-05-01',
    systemGenerated: true,
    actingEstablishmentName: null,
    toPrisonName: 'Leeds (HMP)',
    sealNumber: null,
    containerId: null,
    containerType: null,
    containerSealNumber: null,
    containerStatus: null,
    containerLocationDescription: null,
  }),
]

test.describe('Property history timeline', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('switches to the Property history tab and shows the interleaved timeline', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [container],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetPrisonerPropertyHistory({ prisonerNumber: 'A1234BC', items, priority: 1 })
    await manageUsersApi.stubGetUser({ username: 'AUSER', name: 'John Doe' })
    await page.goto('/prisoner/A1234BC')

    const prisonerPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(prisonerPage.tabProperty).toBeVisible()
    await prisonerPage.tabHistory.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC\/history$/)
    const historyPage = await PropertyHistoryPage.verifyOnPage(page)

    // interleaved, newest first: a container transfer, the prisoner movement, then the creation
    await expect(historyPage.timeline).toContainText(
      'Property container SN880032 transferred out to Isle of Wight (HMP)',
    )
    await expect(historyPage.timeline).toContainText('Transferred out')
    // the acting user is resolved to their name, and the system movement shows "System generated"
    await expect(historyPage.timeline).toContainText('by John Doe, Leeds (HMP)')
    await expect(historyPage.timeline).toContainText('System generated')
    await expect(historyPage.timeline).toContainText('Admitted to Isle of Wight (HMP) — property managed in NOMIS')
    await expect(historyPage.timeline).toContainText('Property container SN880032 added to storage at Leeds (HMP)')
    // the establishment-level DPS-first-used marker
    await expect(historyPage.timeline).toContainText('Property management started in DPS at Leeds (HMP)')

    // the expandable container details link through to the per-container history
    await expect(historyPage.timeline.getByText('Property container details').first()).toBeVisible()
    await historyPage.timeline.getByText('Property container details').first().click()
    await expect(
      historyPage.timeline.getByRole('link', { name: 'View full container history' }).first(),
    ).toHaveAttribute('href', '/prisoner/A1234BC/container/c1')

    // the NOMIS-migration note was removed - the per-prison DPS-first-used marker says this instead
    await expect(page.getByText('History events before')).toHaveCount(0)
  })

  test('shows an empty state when the prisoner has no history', async ({ page }) => {
    await login(page)
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [container],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetPrisonerPropertyHistory({ prisonerNumber: 'A1234BC', items: [], priority: 1 })
    await page.goto('/prisoner/A1234BC/history')

    const historyPage = await PropertyHistoryPage.verifyOnPage(page)
    await expect(historyPage.noHistory).toBeVisible()
  })
})

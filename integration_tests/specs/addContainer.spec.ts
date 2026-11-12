import { expect, test } from '@playwright/test'
import { login, resetStubs } from '../testUtils'
import prisonerPropertyApi from '../mockApis/prisonerPropertyApi'
import prisonerSearchApi from '../mockApis/prisonerSearchApi'
import { getMatchingRequests } from '../mockApis/wiremock'
import PrisonerPropertyPage from '../pages/prisonerPropertyPage'
import PropertyListPage from '../pages/propertyListPage'
import AddContainerDetailsPage from '../pages/addContainerDetailsPage'
import AddContainerLocationPage from '../pages/addContainerLocationPage'
import AddContainerWhereStoredPage from '../pages/addContainerWhereStoredPage'
import AddContainerCheckAnswersPage from '../pages/addContainerCheckAnswersPage'
import type { BoxLocation, PrisonerPropertyContainer } from '../../server/data/prisonerPropertyApiTypes'
import type { Prisoner } from '../../server/data/prisonerSearchApiTypes'

const existingContainer: PrisonerPropertyContainer = {
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
  lastUpdatedDateTime: '2026-06-01T10:00:00',
  createdByUserId: 'AUSER',
}

const prisoner: Prisoner = {
  prisonerNumber: 'A1234BC',
  firstName: 'John',
  lastName: 'Smith',
  dateOfBirth: '2001-01-01',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  cellLocation: 'F-3-042',
  status: 'ACTIVE IN',
}

const box: BoxLocation = {
  id: 'box1',
  prisonId: 'MDI',
  code: 'PROP1',
  localName: 'Reception Store',
  pathHierarchy: 'RECP-PROP1',
  name: 'Reception Store',
  containerCount: 0,
  capacity: 10,
  availableSpaces: 10,
}

test.describe('Add a property container', () => {
  test.afterEach(async () => {
    await resetStubs()
  })

  test('adds a container from the person view and shows a success banner', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      prisonerNumber: 'A1234BC',
      containers: [existingContainer],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetBoxLocations({ prisonId: 'MDI', locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: { ...existingContainer, id: 'newC' }, priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    // The optional disposal date shows Day/Month/Year labels, not the raw bracketed field names.
    await expect(page.getByLabel('Day')).toBeVisible()
    await expect(page.getByLabel('Month')).toBeVisible()
    await expect(page.getByLabel('Year')).toBeVisible()
    await expect(page.getByText('[disposalDate]')).toHaveCount(0)
    await detailsPage.completeWith({ seal: 'SN9', type: 'Valuables' })

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('SN9')
    await locationPage.selectFirstLocation()

    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.heading).toHaveText('Check your answers before adding the property container')
    await expect(checkPage.containerSummary.first()).toContainText('SN9')
    await expect(checkPage.confirm).toHaveText('Add property container')
    await checkPage.confirm.click()

    await expect(page).toHaveURL(/\/prisoner\/A1234BC$/)
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container added')
  })

  test('searches from the establishment list, then adds two containers (one Excess)', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPrisonProperty({ prisonId: 'MDI', groups: [], priority: 1 })
    await prisonerSearchApi.stubSearchPrisoners({ prisoners: [prisoner] })
    await prisonerSearchApi.stubGetPrisoner({ prisoner })
    await prisonerSearchApi.stubGetPrisonerImage({ prisonerNumber: 'A1234BC' })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ prisonerNumber: 'A1234BC', containers: [], priority: 1 })
    await prisonerPropertyApi.stubGetBoxLocations({ prisonId: 'MDI', locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: { ...existingContainer, id: 'newC' }, priority: 1 })

    await page.goto('/')
    const listPage = await PropertyListPage.verifyOnPage(page)
    await listPage.addButton.click()

    await page.getByLabel('Who is the property container for?').fill('Smith')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByTestId('add-link').first().click()

    // Two containers: a Standard (needs a location) and an Excess (chooses where it is stored).
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.fillContainer(0, { seal: 'SN1', type: 'Standard' })
    await detailsPage.addAnother()
    await detailsPage.fillContainer(1, { seal: 'SN2', type: 'Excess' })
    await detailsPage.saveAndContinue()

    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await expect(locationPage.heading).toContainText('SN1')
    await locationPage.selectFirstLocation()

    // The excess container SN2 is then asked where it is stored; send it off-site to Branston.
    const whereStoredPage = await AddContainerWhereStoredPage.verifyOnPage(page)
    await expect(whereStoredPage.heading).toContainText('SN2')
    await whereStoredPage.chooseBranston()

    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(page.getByRole('heading', { name: /Property container SN1/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Property container SN2/ })).toBeVisible()
    // two containers, so the heading and button pluralise
    await expect(checkPage.heading).toHaveText('Check your answers before adding the property containers')
    await expect(checkPage.confirm).toHaveText('Add property containers')
    await checkPage.confirm.click()

    // Confirm creates both and returns to the establishment list with the banner.
    await expect(page.getByTestId('success-banner')).toContainText('2 property containers added')
  })

  test('receives incoming property with a matching seal', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    const incoming: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentSealNumber: 'INCOMING1',
      currentStatus: 'DUE_FOR_TRANSFER_OUT',
      receivingPrisonId: 'MDI',
    }
    const received: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonerCurrentPrisonId: 'MDI',
      currentSealNumber: 'INCOMING1',
      locationDescription: box.name,
    }
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [incoming], priority: 2 })
    await prisonerPropertyApi.stubGetBoxLocations({ locations: [box], priority: 1 })
    await prisonerPropertyApi.stubFindIncomingContainer({ sealNumber: 'INCOMING1', container: incoming })
    await prisonerPropertyApi.stubReceiveContainer({ container: received })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.dueTransferIn).toContainText('INCOMING1')
    await expect(personPage.dueTransferIn).toContainText('Due for transfer in')
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await expect(page.locator('#containers-0-previousSealNumber')).toBeEmpty()
    await detailsPage.completeWith({ seal: 'INCOMING1', type: 'Standard' })
    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await locationPage.selectFirstLocation()
    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    const incomingRow = checkPage.containerSummary.locator('.govuk-summary-list__row').filter({
      has: page.locator('.govuk-summary-list__key', { hasText: 'Incoming property' }),
    })
    await expect(checkPage.containerSummary).toContainText('INCOMING1')
    await expect(incomingRow.locator('.govuk-summary-list__value')).toHaveText(
      'Matched to property due in from Leeds (HMP)',
    )
    await expect(checkPage.containerSummary.getByText('Previous seal number', { exact: true })).toHaveCount(0)

    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      containers: [received, { ...incoming, removalOutcome: 'TRANSFERRED', receivingPrisonId: null }],
      priority: 1,
    })
    await checkPage.confirm.click()
    await expect(page).toHaveURL('/prisoner/A1234BC')
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container added')
    await expect(backPage.inEstablishment).toContainText('INCOMING1')
    await expect(backPage.dueTransferIn).toHaveCount(0)

    const requests = await getMatchingRequests({
      method: 'POST',
      urlPath: '/prisoner-property-api/property-containers/incoming/receive',
    })
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0].body)).toEqual({
      prisonerNumber: prisoner.prisonerNumber,
      receivingPrisonId: 'MDI',
      sealNumber: 'INCOMING1',
      internalLocationId: box.id,
    })
    expect(
      await getMatchingRequests({ method: 'POST', urlPath: '/prisoner-property-api/property-containers' }),
    ).toHaveLength(0)
  })

  test('receives incoming property with a matching seal (ignore case and whitespace)', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    const incoming: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentSealNumber: 'INCOMING1',
      currentStatus: 'TRANSFER',
      removalOutcome: 'TRANSFERRED',
      receivingPrisonId: 'MDI',
    }
    const received: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonerCurrentPrisonId: 'MDI',
      currentSealNumber: 'incoming1',
      locationDescription: box.name,
    }
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [incoming], priority: 2 })
    await prisonerPropertyApi.stubGetBoxLocations({ locations: [box], priority: 1 })
    await prisonerPropertyApi.stubFindIncomingContainer({ sealNumber: 'incoming1', container: incoming })
    await prisonerPropertyApi.stubReceiveContainer({ container: received })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.dueTransferIn).toContainText('INCOMING1')
    await expect(personPage.dueTransferIn).toContainText('In transit')
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await expect(page.locator('#containers-0-previousSealNumber')).toBeEmpty()
    await detailsPage.completeWith({ seal: ' incoming1 ', type: 'Standard' })
    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await locationPage.selectFirstLocation()
    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    const incomingRow = checkPage.containerSummary.locator('.govuk-summary-list__row').filter({
      has: page.locator('.govuk-summary-list__key', { hasText: 'Incoming property' }),
    })
    await expect(checkPage.containerSummary).toContainText('incoming1')
    await expect(incomingRow.locator('.govuk-summary-list__value')).toHaveText(
      'Matched to property due in from Leeds (HMP)',
    )

    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      containers: [received, { ...incoming, receivingPrisonId: null }],
      priority: 1,
    })
    await checkPage.confirm.click()
    await expect(page).toHaveURL('/prisoner/A1234BC')
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container added')
    await expect(backPage.inEstablishment).toContainText('incoming1')
    await expect(backPage.dueTransferIn).toHaveCount(0)

    const requests = await getMatchingRequests({
      method: 'POST',
      urlPath: '/prisoner-property-api/property-containers/incoming/receive',
    })
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0].body)).toEqual({
      prisonerNumber: prisoner.prisonerNumber,
      receivingPrisonId: 'MDI',
      sealNumber: 'incoming1',
      internalLocationId: box.id,
    })
  })

  test('receives a changed seal while retaining the source type and disposal date', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    const incoming: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      currentSealNumber: 'OLD123',
      containerType: 'VALUABLES',
      proposedDisposalDate: '2099-01-01',
    }
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [incoming], priority: 1 })
    await prisonerPropertyApi.stubGetBoxLocations({ locations: [box], priority: 1 })
    await prisonerPropertyApi.stubFindIncomingContainer({ sealNumber: 'OLD123', container: incoming })
    await prisonerPropertyApi.stubReceiveContainer({
      container: { ...incoming, prisonId: 'MDI', currentSealNumber: 'NEW123' },
    })

    await page.goto('/prisoner/A1234BC/add-container')
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.fillContainer(0, { seal: 'NEW123', type: 'Standard' })
    await page.locator('#containers-0-previousSealNumber').fill('OLD123')
    await detailsPage.saveAndContinue()
    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await locationPage.selectFirstLocation()
    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Matched to property due in from Leeds (HMP)')
    await expect(checkPage.containerSummary).toContainText('Valuables')
    await expect(checkPage.containerSummary).toContainText('1 January 2099')
    await expect(checkPage.containerSummary).toContainText('OLD123')
    await expect(checkPage.containerSummary).toContainText('NEW123')
    await checkPage.confirm.click()
    await expect(page).toHaveURL('/prisoner/A1234BC')

    const receipts = await getMatchingRequests({
      method: 'POST',
      urlPath: '/prisoner-property-api/property-containers/incoming/receive',
    })
    expect(receipts).toHaveLength(1)
    expect(JSON.parse(receipts[0].body)).toEqual({
      prisonerNumber: 'A1234BC',
      receivingPrisonId: 'MDI',
      sealNumber: 'NEW123',
      internalLocationId: box.id,
    })
    expect(
      await getMatchingRequests({ method: 'POST', urlPath: '/prisoner-property-api/property-containers' }),
    ).toHaveLength(0)
  })

  test('shows an unmatched explicit previous seal error without creating property', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [existingContainer], priority: 1 })
    await page.goto('/prisoner/A1234BC/add-container')
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.fillContainer(0, { seal: 'NEW', type: 'Standard' })
    await page.locator('#containers-0-previousSealNumber').fill('TYPO')
    await detailsPage.saveAndContinue()
    await expect(detailsPage.errorSummary).toContainText('There is no incoming property with seal number TYPO')
    await expect(detailsPage.errorSummary.getByRole('link')).toHaveAttribute('href', '#containers-0-previousSealNumber')
    await expect(page.locator('#containers-0-previousSealNumber')).toHaveAttribute(
      'aria-describedby',
      /\bcontainers-0-previousSealNumber-error\b/,
    )
    expect(
      await getMatchingRequests({ method: 'POST', urlPath: '/prisoner-property-api/property-containers' }),
    ).toHaveLength(0)
  })

  test('incoming property is not received when when the entered seal does not match', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    const incoming: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'incoming',
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      prisonerCurrentPrisonId: 'MDI',
      inPrisonersCurrentPrison: false,
      currentSealNumber: 'INCOMING1',
      currentStatus: 'DUE_FOR_TRANSFER_OUT',
      receivingPrisonId: 'MDI',
    }
    const added: PrisonerPropertyContainer = {
      ...existingContainer,
      id: 'new',
      prisonerCurrentPrisonId: 'MDI',
      currentSealNumber: 'NEW1',
      locationDescription: box.name,
    }
    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [incoming], priority: 2 })
    await prisonerPropertyApi.stubGetBoxLocations({ locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: added, priority: 1 })

    await page.goto('/prisoner/A1234BC')
    const personPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(personPage.dueTransferIn).toContainText('INCOMING1')
    await expect(personPage.dueTransferIn).toContainText('Due for transfer in')
    await personPage.addProperty.click()

    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await expect(page.locator('#containers-0-previousSealNumber')).toBeEmpty()
    await detailsPage.completeWith({ seal: 'NEW1', type: 'Standard' })
    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await locationPage.selectFirstLocation()
    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('NEW1')
    await expect(checkPage.containerSummary.getByText('Previous seal number', { exact: true })).toHaveCount(0)

    await prisonerPropertyApi.stubGetPropertyForPrisoner({ containers: [added, incoming], priority: 1 })
    await checkPage.confirm.click()
    await expect(page).toHaveURL('/prisoner/A1234BC')
    const backPage = await PrisonerPropertyPage.verifyOnPage(page)
    await expect(backPage.successBanner).toContainText('Property container added')
    await expect(backPage.inEstablishment).toContainText('NEW1')
    await expect(backPage.dueTransferIn).toContainText('INCOMING1')
    await expect(backPage.dueTransferIn).toContainText('Due for transfer in')

    const requests = await getMatchingRequests({
      method: 'POST',
      urlPath: '/prisoner-property-api/property-containers',
    })
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0].body)).toEqual({
      prisonerNumber: prisoner.prisonerNumber,
      prisonId: 'MDI',
      containerType: 'STANDARD',
      sealNumber: 'NEW1',
      internalLocationId: box.id,
    })
  })

  test('re-resolves automatic matches after changing the current seal', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    const incoming = {
      ...existingContainer,
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      currentSealNumber: 'INCOMING1',
    }
    await prisonerPropertyApi.stubFindIncomingContainer({ sealNumber: 'INCOMING1', container: incoming })
    await prisonerPropertyApi.stubFindIncomingContainer({
      sealNumber: 'INCOMING2',
      container: { ...incoming, id: 'other', prisonName: 'Brixton (HMP)' },
    })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      containers: [incoming, { ...incoming, id: 'other', currentSealNumber: 'INCOMING2', prisonName: 'Brixton (HMP)' }],
      priority: 1,
    })
    await prisonerPropertyApi.stubGetBoxLocations({ locations: [box], priority: 1 })
    await prisonerPropertyApi.stubCreateContainer({ container: existingContainer, priority: 1 })

    await page.goto('/prisoner/A1234BC/add-container')
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.completeWith({ seal: 'INCOMING1', type: 'Standard' })
    const locationPage = await AddContainerLocationPage.verifyOnPage(page)
    await locationPage.selectFirstLocation()
    const checkPage = await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Matched to property due in from Leeds (HMP)')

    await page.getByTestId('change-0').click()
    await expect(page.locator('#containers-0-previousSealNumber')).toBeEmpty()
    await detailsPage.completeWith({ seal: 'INCOMING2', type: 'Standard' })
    await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).toContainText('Matched to property due in from Brixton (HMP)')
    await expect(checkPage.containerSummary).not.toContainText('Leeds')

    await page.getByTestId('change-0').click()
    await expect(page.locator('#containers-0-previousSealNumber')).toBeEmpty()
    await detailsPage.completeWith({ seal: 'NEW1', type: 'Standard' })
    await AddContainerCheckAnswersPage.verifyOnPage(page)
    await expect(checkPage.containerSummary).not.toContainText('Incoming property')
    await expect(checkPage.containerSummary).not.toContainText('Previous seal number')
    await checkPage.confirm.click()

    const requests = await getMatchingRequests({
      method: 'POST',
      urlPath: '/prisoner-property-api/property-containers',
    })
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0].body)).toMatchObject({ sealNumber: 'NEW1' })
    expect(JSON.parse(requests[0].body)).not.toHaveProperty('previousSealNumber')
  })

  test('rejects duplicate seals on details before creating any containers', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      containers: [{ ...existingContainer, prisonId: 'LEI', prisonName: 'Leeds (HMP)', currentSealNumber: 'SAME' }],
      priority: 1,
    })
    await page.goto('/prisoner/A1234BC/add-container')
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.fillContainer(0, { seal: 'SAME', type: 'Standard' })
    await detailsPage.addAnother()
    await detailsPage.fillContainer(1, { seal: ' same ', type: 'Standard' })
    await detailsPage.saveAndContinue()

    await expect(detailsPage.errorSummary).toContainText('Enter a different seal number for each property container')
    await expect(detailsPage.errorSummary.getByRole('link')).toHaveAttribute('href', '#containers-1-sealNumber')
    expect(
      await getMatchingRequests({ method: 'POST', urlPath: '/prisoner-property-api/property-containers' }),
    ).toHaveLength(0)
  })

  test('rejects two incoming containers with the same seal without creating property', async ({ page }) => {
    await login(page, { roles: ['ROLE_PRISONERPROP__MANAGE'] })
    await prisonerPropertyApi.stubFindIncomingContainer({
      sealNumber: '0000',
      httpStatus: 409,
      errorCode: 'AMBIGUOUS_INCOMING_CONTAINER',
    })
    const incoming = {
      ...existingContainer,
      prisonId: 'LEI',
      prisonName: 'Leeds (HMP)',
      currentSealNumber: '0000',
      prisonerCurrentPrisonId: 'MDI',
    }
    await prisonerPropertyApi.stubGetPropertyForPrisoner({
      containers: [
        incoming,
        {
          ...incoming,
          id: 'in-transit',
          prisonId: 'BRI',
          prisonName: 'Brixton (HMP)',
          removalOutcome: 'TRANSFERRED',
          receivingPrisonId: 'MDI',
        },
      ],
      priority: 1,
    })
    await page.goto('/prisoner/A1234BC/add-container')
    const detailsPage = await AddContainerDetailsPage.verifyOnPage(page)
    await detailsPage.completeWith({ seal: '0000', type: 'Standard' })

    await expect(detailsPage.errorSummary).toContainText(
      'More than one incoming property container has seal number 0000',
    )
    await expect(detailsPage.errorSummary.getByRole('link')).toHaveAttribute('href', '#containers-0-sealNumber')
    await expect(page.locator('#containers-0-sealNumber')).toHaveValue('0000')
    expect(
      await getMatchingRequests({ method: 'POST', urlPath: '/prisoner-property-api/property-containers' }),
    ).toHaveLength(0)
  })

  test('refuses the search entry for a user without the manage role', async ({ page }) => {
    await login(page)

    await page.goto('/add-container')
    await expect(page.locator('h1')).toContainText('Authorisation Error')
  })
})

import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, flashProvider, user } from './testutils/appSetup'
import AuditService, { Page } from '../services/auditService'
import HmppsAuditClient from '../data/hmppsAuditClient'
import PrisonerPropertyService from '../services/prisonerPropertyService'
import UserService from '../services/userService'
import type {
  BoxLocation,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PropertyEvent,
  RestPage,
} from '../data/prisonerPropertyApiTypes'

jest.mock('../services/auditService')
jest.mock('../services/prisonerPropertyService')
jest.mock('../services/userService')

const auditService = new AuditService({} as HmppsAuditClient) as jest.Mocked<AuditService>
const prisonerPropertyService = new PrisonerPropertyService(null as never) as jest.Mocked<PrisonerPropertyService>
const userService = new UserService(null as never) as jest.Mocked<UserService>

let app: Express

const emptyPage: RestPage<PrisonerPropertyGroup> = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  numberOfElements: 0,
  first: true,
  last: true,
}

beforeEach(() => {
  app = appWithAllRoutes({
    services: { auditService, prisonerPropertyService, userService },
    userSupplier: () => user,
  })
  auditService.logPageView.mockResolvedValue(undefined)
  // connect-flash always returns an array; the test harness mocks req.flash, so default it to empty.
  flashProvider.mockReturnValue([])
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /', () => {
  it('renders the establishment property list for the active caseload', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: 'MDI',
      activeCaseloadName: 'Moorland (HMP & YOI)',
      caseloadIds: ['MDI'],
    })
    prisonerPropertyService.getPrisonProperty.mockResolvedValue({
      ...emptyPage,
      totalElements: 1,
      totalPages: 1,
      numberOfElements: 1,
      content: [
        {
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
        },
      ],
    })

    return request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Moorland (HMP &amp; YOI)')
        expect(res.text).toContain('John Smith')
        expect(res.text).toContain('A1234BC')
        expect(res.text).toContain('SN8842K1')
        expect(res.text).toContain('Valuables')
        expect(res.text).toContain('Branston (offsite)')
        expect(res.text).toContain('Due for disposal')
        expect(prisonerPropertyService.getPrisonProperty).toHaveBeenCalledWith(
          'MDI',
          expect.objectContaining({ page: 0, size: 50 }),
          user.username,
        )
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.PROPERTY_LIST,
          expect.objectContaining({ who: user.username, details: { prisonId: 'MDI' } }),
        )
      })
  })

  it('renders one grouped row-set per prisoner: name, establishment and status', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: 'MDI',
      activeCaseloadName: 'Moorland (HMP & YOI)',
      caseloadIds: ['MDI'],
    })
    prisonerPropertyService.getPrisonProperty.mockResolvedValue({
      ...emptyPage,
      totalElements: 1,
      totalPages: 1,
      numberOfElements: 1,
      content: [
        {
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
            },
            {
              id: 'c2',
              prisonerNumber: 'A1234BC',
              prisonerName: 'John Smith',
              prisonId: 'MDI',
              prisonName: 'Moorland (HMP & YOI)',
              inPrisonersCurrentPrison: false,
              containerType: 'VALUABLES',
              currentSealNumber: 'SN0002',
              currentStatus: 'DUE_FOR_TRANSFER_OUT',
              currentLocation: null,
              currentLocationType: 'INTERNAL',
              locationDescription: 'Reception A2',
              proposedDisposalDate: null,
              removalOutcome: null,
              removalDate: null,
              createDateTime: '2026-06-02T10:00:00',
              createdByUserId: 'AUSER',
              archived: false,
            },
          ],
        },
      ],
    })

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        // The name/link + establishment are row-spanned, so they appear once for the two containers.
        expect(res.text.match(/href="\/prisoner\/A1234BC"/g)).toHaveLength(1)
        expect(res.text).toContain('Leeds (HMP)')
        expect(res.text).toContain('SN0001')
        expect(res.text).toContain('SN0002')
        expect(res.text).toContain('Due for transfer out')
        expect(res.text).toContain('rowspan="2"')
      })
  })

  it('passes search and filters through to the service', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: 'MDI',
      activeCaseloadName: 'Moorland (HMP & YOI)',
      caseloadIds: ['MDI'],
    })
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(app)
      .get('/?q=A1234BC&containerType=STANDARD&status=STORED')
      .expect(200)
      .expect(() => {
        expect(prisonerPropertyService.getPrisonProperty).toHaveBeenCalledWith(
          'MDI',
          expect.objectContaining({ prisonerNumber: 'A1234BC', containerType: 'STANDARD', status: ['STORED'] }),
          user.username,
        )
      })
  })

  it('renders an uppercase prisoner name in title case', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: 'MDI',
      activeCaseloadName: 'Moorland (HMP & YOI)',
      caseloadIds: ['MDI'],
    })
    prisonerPropertyService.getPrisonProperty.mockResolvedValue({
      ...emptyPage,
      totalElements: 1,
      totalPages: 1,
      numberOfElements: 1,
      content: [
        {
          prisonerNumber: 'A1234BC',
          prisonerName: 'JOHN SMITH',
          prisonerCurrentPrisonId: 'MDI',
          prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
          containers: [container({ prisonerName: 'JOHN SMITH' })],
        },
      ],
    })

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('John Smith')
        expect(res.text).not.toContain('JOHN SMITH')
      })
  })

  it('shows the no-caseload page and does not call the property API when there is no active caseload', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: null,
      activeCaseloadName: null,
      caseloadIds: [],
    })

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('You do not have an active caseload')
        expect(prisonerPropertyService.getPrisonProperty).not.toHaveBeenCalled()
        expect(auditService.logPageView).not.toHaveBeenCalled()
      })
  })
})

const container = (overrides: Partial<PrisonerPropertyContainer>): PrisonerPropertyContainer => ({
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
  ...overrides,
})

const withActiveCaseload = () =>
  userService.getActiveCaseload.mockResolvedValue({
    activeCaseloadId: 'MDI',
    activeCaseloadName: 'Moorland (HMP & YOI)',
    caseloadIds: ['MDI'],
  })

describe('GET /prisoner/:prisonerNumber', () => {
  it('renders current and past property for the prisoner and audits the view', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ id: 'c1', currentSealNumber: 'SN0001', currentStatus: 'STORED' }),
      container({
        id: 'c2',
        currentSealNumber: 'SN0002',
        containerType: 'VALUABLES',
        currentStatus: 'RETURNED',
        removalOutcome: 'RETURNED',
        removalDate: '2026-06-20',
        inPrisonersCurrentPrison: false,
        prisonName: 'Leeds (HMP)',
      }),
    ])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('John Smith')
        expect(res.text).toContain('A1234BC')
        expect(res.text).toContain('Current property')
        expect(res.text).toContain('SN0001')
        expect(res.text).toContain('Reception A1')
        expect(res.text).toContain('Past property')
        expect(res.text).toContain('SN0002')
        expect(res.text).toContain('Returned')
        expect(prisonerPropertyService.getPropertyForPrisoner).toHaveBeenCalledWith('A1234BC', user.username)
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.PRISONER_PROPERTY,
          expect.objectContaining({ who: user.username, subjectId: 'A1234BC', subjectType: 'PRISONER_NUMBER' }),
        )
      })
  })

  it('renders the prisoner name in title case and the current establishment from the API field', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({
        prisonerName: 'JOHN SMITH',
        inPrisonersCurrentPrison: false,
        prisonName: 'Leeds (HMP)',
        prisonerCurrentPrisonName: 'Isle of Wight (HMP)',
      }),
    ])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('John Smith')
        expect(res.text).not.toContain('JOHN SMITH')
        // establishment comes from the authoritative field even though no property is held there
        expect(res.text).toContain('Isle of Wight (HMP)')
      })
  })

  it('shows an empty state when the prisoner has no property', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('No property found for this person')
      })
  })

  it('shows the no-caseload page and does not call the property API when there is no active caseload', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: null,
      activeCaseloadName: null,
      caseloadIds: [],
    })

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('You do not have an active caseload')
        expect(prisonerPropertyService.getPropertyForPrisoner).not.toHaveBeenCalled()
        expect(auditService.logPageView).not.toHaveBeenCalled()
      })
  })

  it('returns 404 for an invalid prisoner number', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/not-a-number')
      .expect(404)
      .expect(() => {
        expect(prisonerPropertyService.getPropertyForPrisoner).not.toHaveBeenCalled()
      })
  })
})

const event = (overrides: Partial<PropertyEvent>): PropertyEvent => ({
  id: 'e1',
  eventType: 'CREATED_SEALED',
  eventDateTime: '2026-06-01T10:00:00',
  eventUserId: 'AUSER',
  sealNumber: null,
  fromInternalLocationId: null,
  toInternalLocationId: null,
  toStorageLocationType: null,
  fromPrisonId: null,
  toPrisonId: null,
  eventDate: null,
  relatedContainerId: null,
  ...overrides,
})

describe('GET /prisoner/:prisonerNumber/container/:id', () => {
  it("renders the container's history timeline and audits the view", async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ id: 'c1', currentSealNumber: 'SN0001' }),
    ])
    prisonerPropertyService.getContainerEvents.mockResolvedValue([
      event({ id: 'e2', eventType: 'MOVED', toStorageLocationType: 'BRANSTON' }),
      event({ id: 'e1', eventType: 'CREATED_SEALED', sealNumber: 'SN0001' }),
    ])

    return request(app)
      .get('/prisoner/A1234BC/container/c1')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Property container history')
        expect(res.text).toContain('SN0001')
        expect(res.text).toContain('Created and sealed')
        expect(res.text).toContain('Moved to Branston (offsite)')
        expect(prisonerPropertyService.getContainerEvents).toHaveBeenCalledWith('c1', user.username)
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.CONTAINER_HISTORY,
          expect.objectContaining({ who: user.username, subjectId: 'A1234BC', details: { containerId: 'c1' } }),
        )
      })
  })

  it('returns 404 when the container is not one of the prisoners and does not fetch events', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ id: 'c1' })])

    return request(app)
      .get('/prisoner/A1234BC/container/does-not-exist')
      .expect(404)
      .expect(() => {
        expect(prisonerPropertyService.getContainerEvents).not.toHaveBeenCalled()
      })
  })

  it('shows the no-caseload page and does not call the property API when there is no active caseload', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: null,
      activeCaseloadName: null,
      caseloadIds: [],
    })

    return request(app)
      .get('/prisoner/A1234BC/container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('You do not have an active caseload')
        expect(prisonerPropertyService.getPropertyForPrisoner).not.toHaveBeenCalled()
        expect(prisonerPropertyService.getContainerEvents).not.toHaveBeenCalled()
      })
  })

  it('returns 404 for an invalid prisoner number', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/not-a-number/container/c1')
      .expect(404)
      .expect(() => {
        expect(prisonerPropertyService.getPropertyForPrisoner).not.toHaveBeenCalled()
      })
  })
})

const box = (overrides: Partial<BoxLocation>): BoxLocation => ({
  id: 'box1',
  prisonId: 'MDI',
  code: 'PROP1',
  localName: 'Reception Store',
  pathHierarchy: 'RECP-PROP1',
  name: 'Reception Store',
  containerCount: 0,
  ...overrides,
})

const boxPage = (locations: BoxLocation[]): RestPage<BoxLocation> => ({
  content: locations,
  totalElements: locations.length,
  totalPages: locations.length === 0 ? 0 : 1,
  number: 0,
  size: 20,
  numberOfElements: locations.length,
  first: true,
  last: true,
})

const manageUser = { ...user, userRoles: ['PRISONERPROP__MANAGE'] }
const manageApp = () =>
  appWithAllRoutes({
    services: { auditService, prisonerPropertyService, userService },
    userSupplier: () => manageUser,
  })

describe('Add container journey - access control', () => {
  it('renders the Add property button on the person view for a user with the manage role', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Add property')
        expect(res.text).toContain('/prisoner/A1234BC/add-container')
      })
  })

  it('hides the Add property button from a user without the manage role', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).not.toContain('/prisoner/A1234BC/add-container')
      })
  })

  it('forbids the journey for a user without the manage role', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/A1234BC/add-container/details')
      .expect(403)
      .expect(() => {
        expect(userService.getActiveCaseload).not.toHaveBeenCalled()
      })
  })
})

describe('Add container journey - steps', () => {
  it('renders the details form', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])

    return request(manageApp())
      .get('/prisoner/A1234BC/add-container/details')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Add a property container')
        expect(res.text).toContain('John Smith')
        expect(res.text).toContain('current seal number')
      })
  })

  it('re-renders the details form with an error when the seal number is missing', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(manageApp())
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ containerType: 'STANDARD' })
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('There is a problem')
        expect(res.text).toContain('Enter the property container')
      })
  })

  it('walks details -> location -> check -> confirm and creates the container', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({ id: 'box1', name: 'Reception Store' })]))
    prisonerPropertyService.createContainer.mockResolvedValue(container({ id: 'newC' }))

    const agent = request.agent(manageApp())

    await agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ sealNumber: 'SN9', containerType: 'VALUABLES' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/location')

    await agent
      .get('/prisoner/A1234BC/add-container/location')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Select a storage location for container SN9')
        expect(res.text).toContain('Reception Store')
      })

    await agent
      .post('/prisoner/A1234BC/add-container/location')
      .type('form')
      .send({ internalLocationId: 'box1', locationName: 'Reception Store' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/check')

    await agent
      .get('/prisoner/A1234BC/add-container/check')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Check your answers')
        expect(res.text).toContain('SN9')
        expect(res.text).toContain('Reception Store')
        expect(res.text).toContain('Valuables')
      })

    await agent
      .post('/prisoner/A1234BC/add-container/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC')

    expect(prisonerPropertyService.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        prisonerNumber: 'A1234BC',
        prisonId: 'MDI',
        containerType: 'VALUABLES',
        sealNumber: 'SN9',
        internalLocationId: 'box1',
      }),
      user.username,
    )
    expect(flashProvider).toHaveBeenCalledWith('success', 'Property container added')
    expect(auditService.logPageView).toHaveBeenCalledWith(
      Page.ADD_PROPERTY_CONTAINER,
      expect.objectContaining({ subjectId: 'A1234BC', details: { containerId: 'newC' } }),
    )
  })

  it('redirects back to details with an error when the seal number is already in use (409)', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({})]))
    prisonerPropertyService.createContainer.mockRejectedValue({ responseStatus: 409 })

    const agent = request.agent(manageApp())
    await agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ sealNumber: 'SN9', containerType: 'STANDARD' })
    await agent
      .post('/prisoner/A1234BC/add-container/location')
      .type('form')
      .send({ internalLocationId: 'box1', locationName: 'Reception Store' })

    await agent
      .post('/prisoner/A1234BC/add-container/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/details')

    expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('seal number'))
  })

  it('shows the success banner on the person view from a flash message', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    flashProvider.mockReturnValueOnce(['Property container added'])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Property container added')
      })
  })
})

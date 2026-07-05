import type { Express } from 'express'
import { Readable } from 'stream'
import request from 'supertest'
import { appWithAllRoutes, flashProvider, user } from './testutils/appSetup'
import AuditService, { Page } from '../services/auditService'
import HmppsAuditClient from '../data/hmppsAuditClient'
import PrisonerPropertyService from '../services/prisonerPropertyService'
import PrisonerService from '../services/prisonerService'
import UserService from '../services/userService'
import type {
  BoxLocation,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PropertyEvent,
  RestPage,
} from '../data/prisonerPropertyApiTypes'
import type { Prisoner } from '../data/prisonerSearchApiTypes'

jest.mock('../services/auditService')
jest.mock('../services/prisonerPropertyService')
jest.mock('../services/prisonerService')
jest.mock('../services/userService')

const auditService = new AuditService({} as HmppsAuditClient) as jest.Mocked<AuditService>
const prisonerPropertyService = new PrisonerPropertyService(null as never) as jest.Mocked<PrisonerPropertyService>
const prisonerService = new PrisonerService(null as never, null as never) as jest.Mocked<PrisonerService>
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
    services: { auditService, prisonerPropertyService, prisonerService, userService },
    userSupplier: () => user,
  })
  auditService.logPageView.mockResolvedValue(undefined)
  // Banner details default to a baseline prisoner so the property page renders; individual tests
  // override this to exercise the banner's establishment-dependent fields.
  prisonerService.getPrisonerDetails.mockResolvedValue(prisoner())
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

const prisoner = (overrides: Partial<Prisoner> = {}): Prisoner => ({
  prisonerNumber: 'A1234BC',
  firstName: 'John',
  lastName: 'Smith',
  dateOfBirth: '2001-01-01',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  cellLocation: 'F-3-042',
  status: 'ACTIVE IN',
  ...overrides,
})

const withActiveCaseload = () =>
  userService.getActiveCaseload.mockResolvedValue({
    activeCaseloadId: 'MDI',
    activeCaseloadName: 'Moorland (HMP & YOI)',
    caseloadIds: ['MDI'],
  })

describe('GET /prisoner/:prisonerNumber', () => {
  it('variant A (prisoner here): splits property in this establishment from property due to transfer in', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ id: 'c1', prisonId: 'MDI', prisonerCurrentPrisonId: 'MDI', currentSealNumber: 'SN0001' }),
      container({
        id: 'c2',
        prisonId: 'LEI',
        prisonName: 'Leeds (HMP)',
        prisonerCurrentPrisonId: 'MDI',
        inPrisonersCurrentPrison: false,
        currentSealNumber: 'SN0002',
        containerType: 'VALUABLES',
        currentStatus: 'DUE_FOR_TRANSFER_OUT',
      }),
    ])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('John Smith')
        expect(res.text).toContain('A1234BC')
        expect(res.text).toContain('Property in this establishment')
        expect(res.text).toContain('SN0001')
        expect(res.text).toContain('Stored')
        expect(res.text).toContain('Property due to be transferred in')
        expect(res.text).toContain('SN0002')
        expect(res.text).toContain('Leeds (HMP)')
        expect(res.text).toContain('Due for transfer in')
        expect(res.text).not.toContain('no longer in this establishment')
        expect(prisonerPropertyService.getPropertyForPrisoner).toHaveBeenCalledWith('A1234BC', user.username)
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.PRISONER_PROPERTY,
          expect.objectContaining({ who: user.username, subjectId: 'A1234BC', subjectType: 'PRISONER_NUMBER' }),
        )
      })
  })

  it('variant B (prisoner has left): warns, shows Due for transfer out and the prisoner establishment', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({
        id: 'c1',
        prisonId: 'MDI',
        prisonerCurrentPrisonId: 'IWI',
        prisonerCurrentPrisonName: 'Isle of Wight (HMP)',
        inPrisonersCurrentPrison: false,
        currentSealNumber: 'SN0003',
        currentStatus: 'DUE_FOR_TRANSFER_OUT',
      }),
    ])

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('no longer in this establishment')
        expect(res.text).toContain('Property in this establishment')
        expect(res.text).toContain('SN0003')
        expect(res.text).toContain('Due for transfer out')
        expect(res.text).toContain('Isle of Wight (HMP)')
        // the prisoner is not here, so nothing is due to transfer in
        expect(res.text).not.toContain('Property due to be transferred in')
      })
  })

  it('renders the prisoner name in title case in the heading and the establishment from prisoner-search', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'JOHN SMITH' })])
    prisonerService.getPrisonerDetails.mockResolvedValue(prisoner({ prisonName: 'Isle of Wight (HMP)' }))

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('John Smith')
        expect(res.text).not.toContain('JOHN SMITH')
        // establishment on the banner comes from prisoner-search
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

  it('renders the prisoner banner with cell number and status when the prisoner is in this establishment', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerService.getPrisonerDetails.mockResolvedValue(
      prisoner({ prisonId: 'MDI', cellLocation: 'F-3-042', status: 'ACTIVE IN', dateOfBirth: '2001-01-01' }),
    )

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(prisonerService.getPrisonerDetails).toHaveBeenCalledWith('A1234BC', user.username)
        // name in "Lastname, Firstname" order, linking to the DPS profile
        expect(res.text).toContain('Smith, John')
        expect(res.text).toContain('/prisoner/A1234BC"')
        expect(res.text).toContain('01/01/2001')
        expect(res.text).toContain('Cell number')
        expect(res.text).toContain('F-3-042')
        expect(res.text).toContain('ACTIVE IN')
        expect(res.text).toContain('/prisoner/A1234BC/image')
      })
  })

  it('omits cell number and status from the banner when the prisoner is not in this establishment', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerService.getPrisonerDetails.mockResolvedValue(
      prisoner({ prisonId: 'LEI', cellLocation: 'A-1-001', status: 'ACTIVE OUT' }),
    )

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Smith, John')
        expect(res.text).not.toContain('Cell number')
        expect(res.text).not.toContain('A-1-001')
        expect(res.text).not.toContain('ACTIVE OUT')
      })
  })

  it('still renders the page with a fallback banner when prisoner-search is unavailable', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])
    prisonerService.getPrisonerDetails.mockRejectedValue(new Error('prisoner-search down'))

    return request(app)
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('data-qa="prisoner-banner"')
        expect(res.text).toContain('John Smith')
        expect(res.text).not.toContain('Cell number')
      })
  })
})

describe('GET /prisoner/:prisonerNumber/image', () => {
  it('streams the prisoner image from prison-api', async () => {
    withActiveCaseload()
    prisonerService.getPrisonerImage.mockResolvedValue(Readable.from(['image-bytes']))

    return request(app)
      .get('/prisoner/A1234BC/image')
      .expect(200)
      .expect('Content-Type', /image\/jpeg/)
      .expect(res => {
        expect(prisonerService.getPrisonerImage).toHaveBeenCalledWith('A1234BC', user.username)
        expect(res.body.toString()).toContain('image-bytes')
      })
  })

  it('redirects to the placeholder when no image is available', async () => {
    withActiveCaseload()
    prisonerService.getPrisonerImage.mockRejectedValue(new Error('404 Not Found'))

    return request(app)
      .get('/prisoner/A1234BC/image')
      .expect(302)
      .expect('Location', '/assets/images/prisoner-image-withheld.svg')
  })

  it('returns 404 for an invalid prisoner number', async () => {
    return request(app)
      .get('/prisoner/not-a-number/image')
      .expect(404)
      .expect(() => {
        expect(prisonerService.getPrisonerImage).not.toHaveBeenCalled()
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
    services: { auditService, prisonerPropertyService, prisonerService, userService },
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

import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, user } from './testutils/appSetup'
import AuditService, { Page } from '../services/auditService'
import HmppsAuditClient from '../data/hmppsAuditClient'
import PrisonerPropertyService from '../services/prisonerPropertyService'
import UserService from '../services/userService'
import type {
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
          expect.objectContaining({ page: 0, size: 20 }),
          user.username,
        )
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.PROPERTY_LIST,
          expect.objectContaining({ who: user.username, details: { prisonId: 'MDI' } }),
        )
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

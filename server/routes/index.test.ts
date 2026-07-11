import type { Express } from 'express'
import { Readable } from 'stream'
import request from 'supertest'
import { appWithAllRoutes, flashProvider, user } from './testutils/appSetup'
import AuditService, { Page } from '../services/auditService'
import HmppsAuditClient from '../data/hmppsAuditClient'
import PrisonerPropertyService from '../services/prisonerPropertyService'
import PrisonerService from '../services/prisonerService'
import UserService from '../services/userService'
import ActiveAgenciesService from '../services/activeAgenciesService'
import type {
  BoxLocation,
  PrisonerPropertyContainer,
  PrisonerPropertyGroup,
  PrisonerTimelineItem,
  PropertyEvent,
  RestPage,
} from '../data/prisonerPropertyApiTypes'
import type { Prisoner } from '../data/prisonerSearchApiTypes'
import { NomisScreenNotSetUpError } from '../utils/nomisSplash'

jest.mock('../services/auditService')
jest.mock('../services/prisonerPropertyService')
jest.mock('../services/prisonerService')
jest.mock('../services/userService')
jest.mock('../services/activeAgenciesService')

const auditService = new AuditService({} as HmppsAuditClient) as jest.Mocked<AuditService>
const prisonerPropertyService = new PrisonerPropertyService(null as never) as jest.Mocked<PrisonerPropertyService>
const prisonerService = new PrisonerService(null as never, null as never) as jest.Mocked<PrisonerService>
const userService = new UserService(null as never) as jest.Mocked<UserService>
const activeAgenciesService = new ActiveAgenciesService(null as never) as jest.Mocked<ActiveAgenciesService>

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
    services: { auditService, prisonerPropertyService, prisonerService, userService, activeAgenciesService },
    userSupplier: () => user,
  })
  auditService.logPageView.mockResolvedValue(undefined)
  // Default every establishment to switched-on in DPS so existing behaviour (writes gated only on the
  // manage role) holds; the active-prison tests override this to false.
  activeAgenciesService.isPrisonActive.mockResolvedValue(true)
  // The list route always fetches the summary. Default it to null so existing tests render without the
  // bar; tests that assert the bar override this.
  prisonerPropertyService.getPrisonPropertySummary.mockResolvedValue(null as never)
  // Banner details default to a baseline prisoner so the property page renders; individual tests
  // override this to exercise the banner's establishment-dependent fields.
  prisonerService.getPrisonerDetails.mockResolvedValue(prisoner())
  // connect-flash always returns an array; the test harness mocks req.flash, so default it to empty.
  flashProvider.mockReturnValue([])
  // The history + container pages resolve acting-user names; default to none so they fall back to the
  // raw username. Tests that assert a resolved name override this.
  userService.getUserDisplayNames.mockResolvedValue(new Map())
  // The admin console reads NOMIS splash-screen states; default to an empty (all-Normal) map so it
  // renders. Tests that assert specific NOMIS states or the unavailable notice override this.
  prisonerService.getNomisScreenStates.mockResolvedValue(new Map())
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
        // The heading is just "Prisoner property" - the establishment name is no longer appended (MAPB-642).
        expect(res.text).toContain('<h1 class="govuk-heading-xl govuk-!-margin-bottom-4">Prisoner property</h1>')
        expect(res.text).not.toContain('Moorland (HMP &amp; YOI)')
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

  it('hides the Change/Remove links for removed containers but still renders the row (MAPB-642)', async () => {
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
          prisonerCurrentPrisonId: 'MDI',
          prisonerCurrentPrisonName: 'Moorland (HMP & YOI)',
          containers: [
            {
              id: 'held',
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
            },
            {
              id: 'removed',
              prisonerNumber: 'A1234BC',
              prisonerName: 'John Smith',
              prisonId: 'MDI',
              prisonName: 'Moorland (HMP & YOI)',
              inPrisonersCurrentPrison: true,
              containerType: 'EXCESS',
              currentSealNumber: 'SN0002',
              currentStatus: 'DISPOSED',
              currentLocation: null,
              currentLocationType: 'INTERNAL',
              locationDescription: 'Reception A2',
              proposedDisposalDate: null,
              removalOutcome: 'DISPOSED',
              removalDate: '2026-06-05T10:00:00',
              createDateTime: '2026-06-02T10:00:00',
              createdByUserId: 'AUSER',
              archived: false,
            },
          ],
        },
      ],
    })

    return request(manageApp())
      .get('/')
      .expect(200)
      .expect(res => {
        // Only the held container gets action links; the removed one must not (the routes 404 on it).
        expect(res.text.match(/data-qa="change-link"/g)).toHaveLength(1)
        expect(res.text.match(/data-qa="remove-link"/g)).toHaveLength(1)
        expect(res.text).toContain('change-container/held')
        expect(res.text).not.toContain('change-container/removed')
        expect(res.text).not.toContain('remove-container/removed')
        // The removed row itself still renders, with its Disposed status tag.
        expect(res.text).toContain('SN0002')
        expect(res.text).toContain('Disposed')
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
      .get('/?q=A1234BC&containerType=STANDARD&status=STORED&includeRemoved=true')
      .expect(200)
      .expect(() => {
        expect(prisonerPropertyService.getPrisonProperty).toHaveBeenCalledWith(
          'MDI',
          expect.objectContaining({
            query: 'A1234BC',
            containerType: ['STANDARD'],
            status: ['STORED'],
            includeRemoved: true,
          }),
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

  it('renders the summary tiles when the summary service returns counts', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)
    prisonerPropertyService.getPrisonPropertySummary.mockResolvedValue({
      availableStorageLocations: 150,
      storedOnSite: 3000,
      dueToTransferOut: 80,
      dueToBeReturned: 0,
      dueToBeDisposed: 40,
    })

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Available storage locations on-site')
        expect(res.text).toContain('150')
        expect(res.text).toContain('Property containers stored on-site')
        expect(res.text).toContain('3000')
        expect(res.text).toContain('Property containers due to transfer out')
        expect(res.text).toContain('Property containers due to be disposed')
        expect(prisonerPropertyService.getPrisonPropertySummary).toHaveBeenCalledWith('MDI', user.username)
      })
  })

  it('still renders the list (without the summary bar) when the summary fetch fails', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)
    prisonerPropertyService.getPrisonPropertySummary.mockRejectedValue(new Error('not deployed yet'))

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).not.toContain('data-qa="property-summary"')
        expect(res.text).toContain('No property containers found.')
      })
  })

  it('describes a mid-move prisoner in the establishment column', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue({
      ...emptyPage,
      totalElements: 1,
      totalPages: 1,
      numberOfElements: 1,
      content: [
        {
          prisonerNumber: 'A1234BC',
          prisonerName: 'John Smith',
          prisonerCurrentPrisonId: null,
          prisonerCurrentPrisonName: null,
          prisonerMovementStatus: 'IN_TRANSIT',
          containers: [container({})],
        },
      ],
    })

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Transferring')
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
  fromPrisonName: null,
  toPrisonId: null,
  toPrisonName: null,
  containerType: 'STANDARD',
  eventDate: null,
  relatedContainerId: null,
  ...overrides,
})

const timelineItem = (overrides: Partial<PrisonerTimelineItem> = {}): PrisonerTimelineItem => ({
  itemType: 'CONTAINER_EVENT',
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
  sealNumber: 'SN0001',
  relatedContainerId: null,
  containerId: 'c1',
  containerType: 'STANDARD',
  containerSealNumber: 'SN0001',
  containerStatus: 'STORED',
  containerLocationDescription: 'Reception A1',
  ...overrides,
})

describe('GET /prisoner/:prisonerNumber/history', () => {
  it('renders the whole-property timeline with tabs, tags, bylines and audits the view', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])
    prisonerPropertyService.getPrisonerPropertyHistory.mockResolvedValue([
      timelineItem({
        itemType: 'PRISONER_MOVEMENT',
        eventType: null,
        eventStatus: null,
        systemGenerated: true,
        prisonerName: 'JOHN SMITH',
        actingEstablishmentName: 'Moorland (HMP & YOI)',
        toPrisonName: 'Moorland (HMP & YOI)',
        sealNumber: null,
        containerId: null,
      }),
      timelineItem({
        eventId: 'e2',
        eventType: 'TRANSFERRED',
        eventStatus: 'TRANSFER',
        toPrisonName: 'Moorland (HMP & YOI)',
      }),
    ])

    return request(app)
      .get('/prisoner/A1234BC/history')
      .expect('Content-Type', /html/)
      .expect(200)
      .expect(res => {
        // the shared header with the two tabs, the history tab current
        expect(res.text).toContain('data-qa="tab-property"')
        expect(res.text).toContain('data-qa="tab-history"')
        expect(res.text).toContain('data-qa="property-timeline"')
        // a container event line + status tag + byline
        expect(res.text).toContain('Property container SN0001 transferred out to Moorland (HMP &amp; YOI)')
        expect(res.text).toContain('Transferred out')
        expect(res.text).toContain('by AUSER, Leeds (HMP)')
        // the prisoner movement line
        expect(res.text).toContain('JOHN SMITH arrived at Moorland (HMP &amp; YOI)')
        // the expandable container details + link
        expect(res.text).toContain('Property container details')
        expect(res.text).toContain('/prisoner/A1234BC/container/c1')
        // the NOMIS-migration closing note
        expect(res.text).toContain('History events before')
        expect(prisonerPropertyService.getPrisonerPropertyHistory).toHaveBeenCalledWith('A1234BC', user.username)
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.PRISONER_PROPERTY_HISTORY,
          expect.objectContaining({ who: user.username, subjectId: 'A1234BC' }),
        )
      })
  })

  it('resolves the acting user to their name in the byline', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getPrisonerPropertyHistory.mockResolvedValue([
      timelineItem({ eventType: 'TRANSFERRED', eventStatus: 'TRANSFER', eventUserId: 'AUSER' }),
    ])
    userService.getUserDisplayNames.mockResolvedValue(new Map([['AUSER', 'John Doe']]))

    return request(app)
      .get('/prisoner/A1234BC/history')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('by John Doe, Leeds (HMP)')
        expect(res.text).not.toContain('by AUSER')
        expect(userService.getUserDisplayNames).toHaveBeenCalledWith(['AUSER'], user.username)
      })
  })

  it('shows an empty state when the prisoner has no history', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getPrisonerPropertyHistory.mockResolvedValue([])

    return request(app)
      .get('/prisoner/A1234BC/history')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('No property history is available for this person.')
      })
  })

  it('shows the no-caseload page and calls no APIs when there is no active caseload', async () => {
    userService.getActiveCaseload.mockResolvedValue({
      activeCaseloadId: null,
      activeCaseloadName: null,
      caseloadIds: [],
    })

    return request(app)
      .get('/prisoner/A1234BC/history')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('You do not have an active caseload')
        expect(prisonerPropertyService.getPrisonerPropertyHistory).not.toHaveBeenCalled()
      })
  })

  it('returns 404 for an invalid prisoner number', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/not-a-number/history')
      .expect(404)
      .expect(() => {
        expect(prisonerPropertyService.getPrisonerPropertyHistory).not.toHaveBeenCalled()
      })
  })
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
        expect(res.text).toContain('Added to storage')
        expect(res.text).toContain('Moved to Branston (offsite)')
        expect(prisonerPropertyService.getContainerEvents).toHaveBeenCalledWith('c1', user.username)
        expect(auditService.logPageView).toHaveBeenCalledWith(
          Page.CONTAINER_HISTORY,
          expect.objectContaining({ who: user.username, subjectId: 'A1234BC', details: { containerId: 'c1' } }),
        )
      })
  })

  it('resolves the acting user to their name, and shows "System generated" for system events', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ id: 'c1' })])
    prisonerPropertyService.getContainerEvents.mockResolvedValue([
      event({ id: 'e2', eventType: 'PRISONER_RELEASED', eventUserId: 'PRISONER_PROPERTY_API' }),
      event({ id: 'e1', eventType: 'CREATED_SEALED', eventUserId: 'AUSER' }),
    ])
    userService.getUserDisplayNames.mockResolvedValue(new Map([['AUSER', 'John Doe']]))

    return request(app)
      .get('/prisoner/A1234BC/container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('by John Doe')
        expect(res.text).toContain('System generated')
        expect(res.text).not.toContain('by AUSER')
        expect(res.text).not.toContain('by PRISONER_PROPERTY_API')
        expect(userService.getUserDisplayNames).toHaveBeenCalledWith(['PRISONER_PROPERTY_API', 'AUSER'], user.username)
      })
  })

  it('falls back to the raw username when the name cannot be resolved', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ id: 'c1' })])
    prisonerPropertyService.getContainerEvents.mockResolvedValue([event({ id: 'e1', eventUserId: 'AUSER' })])
    userService.getUserDisplayNames.mockResolvedValue(new Map())

    return request(app)
      .get('/prisoner/A1234BC/container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('by AUSER')
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
    services: { auditService, prisonerPropertyService, prisonerService, userService, activeAgenciesService },
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

describe('Active-prison write gate', () => {
  it('hides the Add button and shows the NOMIS banner on the list when the prison is not active in DPS', async () => {
    withActiveCaseload()
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(manageApp())
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('currently managed in NOMIS')
        expect(res.text).not.toContain('Add a property container')
      })
  })

  it('hides the Add property button and shows the NOMIS banner on the person view when the prison is not active', async () => {
    withActiveCaseload()
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('currently managed in NOMIS')
        expect(res.text).not.toContain('/prisoner/A1234BC/add-container')
      })
  })

  it('forbids a GET write journey when the prison is not active, even with the manage role', async () => {
    withActiveCaseload()
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)

    return request(manageApp()).get('/prisoner/A1234BC/add-container/details').expect(403)
  })

  it('forbids a POST write journey when the prison is not active, even with the manage role', async () => {
    withActiveCaseload()
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)

    return request(manageApp())
      .post('/prisoner/A1234BC/add-container/confirm')
      .type('form')
      .send({})
      .expect(403)
      .expect(() => {
        expect(prisonerPropertyService.createContainer).not.toHaveBeenCalled()
      })
  })

  it('does not show the NOMIS banner to a user without the manage role', async () => {
    withActiveCaseload()
    activeAgenciesService.isPrisonActive.mockResolvedValue(false)
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).not.toContain('currently managed in NOMIS')
      })
  })
})

describe('Add container journey - search entry', () => {
  it('renders the search page from the establishment list', async () => {
    withActiveCaseload()

    return request(manageApp())
      .get('/add-container')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Who is the property container for?')
        expect(res.text).toContain('You can search by name or prison number')
      })
  })

  it('errors on an empty search term', async () => {
    withActiveCaseload()

    return request(manageApp())
      .get('/add-container?q=')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('There is a problem')
        expect(res.text).toContain('Enter a name or prison number')
      })
  })

  it('lists matching prisoners scoped to the caseload with add and view actions', async () => {
    withActiveCaseload()
    prisonerService.searchPrisoners.mockResolvedValue({
      ...emptyPage,
      totalElements: 1,
      totalPages: 1,
      numberOfElements: 1,
      content: [
        prisoner({ prisonerNumber: 'A0038EA', firstName: 'Matthew', lastName: 'Sonom', cellLocation: 'F-7-003' }),
      ],
    } as never)

    await request(manageApp())
      .get('/add-container?q=Sonom')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('A0038EA')
        expect(res.text).toContain('F-7-003')
        expect(res.text).toContain('/prisoner/A0038EA/add-container?from=list')
        expect(res.text).toContain('/prisoner/A0038EA/image')
      })

    expect(prisonerService.searchPrisoners).toHaveBeenCalledWith('Sonom', 'MDI', 0, 50, user.username)
  })

  it('forbids the search page for a user without the manage role', async () => {
    withActiveCaseload()

    return request(app).get('/add-container').expect(403)
  })
})

describe('Add container journey - steps', () => {
  const startJourney = async (agent: ReturnType<typeof request.agent>, from = 'person') => {
    await agent.get(`/prisoner/A1234BC/add-container?from=${from}`).expect(302)
  }

  it('renders the details form', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])

    const agent = request.agent(manageApp())
    await startJourney(agent)
    return agent
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

    const agent = request.agent(manageApp())
    await startJourney(agent)
    return agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ 'containers[0][containerType]': 'STANDARD' })
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('There is a problem')
        expect(res.text).toContain('Enter the property container')
      })
  })

  it('walks details -> location -> check -> confirm and adds the container, returning to the list', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ prisonerName: 'John Smith' })])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({ id: 'box1', name: 'Reception Store' })]))
    prisonerPropertyService.createContainer.mockResolvedValue(container({ id: 'newC' }))

    const agent = request.agent(manageApp())
    await startJourney(agent, 'list')

    await agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ 'containers[0][sealNumber]': 'SN9', 'containers[0][containerType]': 'VALUABLES' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/location/0')

    await agent
      .get('/prisoner/A1234BC/add-container/location/0')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Select a storage location for container SN9')
        expect(res.text).toContain('Reception Store')
      })

    await agent
      .post('/prisoner/A1234BC/add-container/location/0')
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
      .expect('location', '/')

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
    expect(flashProvider).toHaveBeenCalledWith('success', 'Property container(s) added')
    expect(auditService.logPageView).toHaveBeenCalledWith(
      Page.ADD_PROPERTY_CONTAINER,
      expect.objectContaining({ subjectId: 'A1234BC', details: { count: 1 } }),
    )
  })

  it('adds multiple containers in one journey, skipping the location step for excess', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({ id: 'box1', name: 'Reception Store' })]))
    prisonerPropertyService.createContainer.mockResolvedValue(container({ id: 'newC' }))

    const agent = request.agent(manageApp())
    await startJourney(agent)

    // Two containers: a Standard (needs a location) and an Excess (off-site Branston, no location step).
    await agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({
        'containers[0][sealNumber]': 'SN1',
        'containers[0][containerType]': 'STANDARD',
        'containers[1][sealNumber]': 'SN2',
        'containers[1][containerType]': 'EXCESS',
      })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/location/0')

    // Only container 0 needs a location; selecting it goes straight to check (container 1 is Excess).
    await agent
      .post('/prisoner/A1234BC/add-container/location/0')
      .type('form')
      .send({ internalLocationId: 'box1', locationName: 'Reception Store' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/add-container/check')

    await agent.post('/prisoner/A1234BC/add-container/confirm').type('form').send({}).expect(302)

    expect(prisonerPropertyService.createContainer).toHaveBeenCalledTimes(2)
    expect(prisonerPropertyService.createContainer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sealNumber: 'SN1', containerType: 'STANDARD', internalLocationId: 'box1' }),
      user.username,
    )
    expect(prisonerPropertyService.createContainer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sealNumber: 'SN2', containerType: 'EXCESS', internalLocationId: undefined }),
      user.username,
    )
  })

  it('appends an empty block on "Add another" without validating', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    const agent = request.agent(manageApp())
    await startJourney(agent)
    return agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ 'containers[0][sealNumber]': 'SN1', 'containers[0][containerType]': 'STANDARD', action: 'addAnother' })
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Add another property container')
        expect(res.text).not.toContain('There is a problem')
        expect(res.text).toContain('value="SN1"')
      })
  })

  it('redirects back to details with an error when a seal number is already in use (409)', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({})]))
    prisonerPropertyService.createContainer.mockRejectedValue({ responseStatus: 409 })

    const agent = request.agent(manageApp())
    await startJourney(agent)
    await agent
      .post('/prisoner/A1234BC/add-container/details')
      .type('form')
      .send({ 'containers[0][sealNumber]': 'SN9', 'containers[0][containerType]': 'STANDARD' })
    await agent
      .post('/prisoner/A1234BC/add-container/location/0')
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
    flashProvider.mockReturnValueOnce(['Property container(s) added'])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Property container(s) added')
      })
  })
})

describe('Remove container journey - access control', () => {
  it('renders a Remove link on the person view for a user with the manage role', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('/prisoner/A1234BC/remove-container/c1?from=person')
      })
  })

  it('forbids the journey for a user without the manage role', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/A1234BC/remove-container/c1')
      .expect(403)
      .expect(() => {
        expect(userService.getActiveCaseload).not.toHaveBeenCalled()
      })
  })
})

describe('Remove container journey - steps', () => {
  it('renders the reason screen with the container details and reasons', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ currentSealNumber: 'SN0001', currentStatus: 'DISPOSAL_REQUIRED' }),
    ])

    return request(manageApp())
      .get('/prisoner/A1234BC/remove-container/c1?from=list')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Remove property container SN0001')
        expect(res.text).toContain('Why are you removing this property container record?')
        expect(res.text).toContain('The property has been returned')
        expect(res.text).toContain('This record was created in error')
        expect(res.text).toContain('Due for disposal')
      })
  })

  it('404s when the container is not found for the prisoner', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ id: 'other' })])

    return request(manageApp()).get('/prisoner/A1234BC/remove-container/c1').expect(404)
  })

  it('404s when the container has already been removed', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ removalOutcome: 'RETURNED' })])

    return request(manageApp()).get('/prisoner/A1234BC/remove-container/c1').expect(404)
  })

  it('re-renders the reason screen with an error when no reason is chosen', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/remove-container/c1')
    return agent
      .post('/prisoner/A1234BC/remove-container/c1')
      .type('form')
      .send({})
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('There is a problem')
        expect(res.text).toContain('Select why you are removing')
      })
  })

  it('walks reason -> check -> confirm for a return and returns to the person view', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({ currentSealNumber: 'SN0001' })])
    prisonerPropertyService.removeContainer.mockResolvedValue(container({}))

    const agent = request.agent(manageApp())

    await agent.get('/prisoner/A1234BC/remove-container/c1?from=person').expect(200)

    await agent
      .post('/prisoner/A1234BC/remove-container/c1')
      .type('form')
      .send({ outcome: 'RETURNED' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/remove-container/c1/check')

    await agent
      .get('/prisoner/A1234BC/remove-container/c1/check')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Check your answers')
        expect(res.text).toContain('Returned')
        expect(res.text).toContain('Date property returned')
      })

    await agent
      .post('/prisoner/A1234BC/remove-container/c1/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC')

    expect(prisonerPropertyService.removeContainer).toHaveBeenCalledWith(
      'c1',
      { outcome: 'RETURNED', toPrisonId: undefined },
      user.username,
    )
    expect(flashProvider).toHaveBeenCalledWith('success', 'Property container removed')
    expect(auditService.logPageView).toHaveBeenCalledWith(
      Page.REMOVE_PROPERTY_CONTAINER,
      expect.objectContaining({ subjectId: 'A1234BC', details: { containerId: 'c1', outcome: 'RETURNED' } }),
    )
  })

  it('returns to the establishment list when the journey started there', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.removeContainer.mockResolvedValue(container({}))

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/remove-container/c1?from=list')
    await agent.post('/prisoner/A1234BC/remove-container/c1').type('form').send({ outcome: 'DISPOSED' })
    await agent
      .post('/prisoner/A1234BC/remove-container/c1/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/')
  })

  it('transfers straight to check when the prisoner has been received elsewhere', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({
        prisonerCurrentPrisonId: 'LEI',
        prisonerCurrentPrisonName: 'Leeds (HMP)',
        prisonerMovementStatus: 'IN_ESTABLISHMENT',
      }),
    ])
    prisonerPropertyService.removeContainer.mockResolvedValue(container({}))

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/remove-container/c1?from=person')
    await agent
      .post('/prisoner/A1234BC/remove-container/c1')
      .type('form')
      .send({ outcome: 'TRANSFERRED' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/remove-container/c1/check')

    await agent.post('/prisoner/A1234BC/remove-container/c1/confirm').type('form').send({}).expect(302)

    expect(prisonerPropertyService.removeContainer).toHaveBeenCalledWith(
      'c1',
      { outcome: 'TRANSFERRED', toPrisonId: 'LEI' },
      user.username,
    )
  })

  it('shows the interruption when the prisoner has not been received into the new establishment yet', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({
        prisonerName: 'John Smith',
        prisonerCurrentPrisonId: 'MDI',
        prisonerMovementStatus: 'IN_ESTABLISHMENT',
      }),
    ])

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/remove-container/c1?from=person')
    await agent
      .post('/prisoner/A1234BC/remove-container/c1')
      .type('form')
      .send({ outcome: 'TRANSFERRED' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/remove-container/c1/interruption')

    await agent
      .get('/prisoner/A1234BC/remove-container/c1/interruption')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('has not been received into')
        expect(res.text).toContain('Continue and remove property container')
        expect(res.text).toContain('/prisoner/A1234BC/remove-container/c1/check')
      })
  })
})

describe('Combine containers journey', () => {
  const twoContainers = () => [
    container({ id: 'c1', currentSealNumber: 'SN0001' }),
    container({ id: 'c2', currentSealNumber: 'SN0002' }),
  ]

  it('renders the combine form (posting to the start route) for a user with the manage role', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue(twoContainers())

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('action="/prisoner/A1234BC/combine"')
        expect(res.text).toContain('Combine selected property containers')
      })
  })

  it('forbids the journey for a user without the manage role', async () => {
    withActiveCaseload()

    return request(app)
      .post('/prisoner/A1234BC/combine')
      .type('form')
      .send({ containerIds: ['c1', 'c2'] })
      .expect(403)
      .expect(() => {
        expect(userService.getActiveCaseload).not.toHaveBeenCalled()
      })
  })

  it('redirects back to the person view with an error when fewer than two are selected', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue(twoContainers())

    await request(manageApp())
      .post('/prisoner/A1234BC/combine')
      .type('form')
      .send({ containerIds: 'c1' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC')

    expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('two or more'))
  })

  it('walks start -> details -> location -> check -> confirm and combines the containers', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue(twoContainers())
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({ id: 'box1', name: 'Reception Store' })]))
    prisonerPropertyService.combineContainers.mockResolvedValue(container({ id: 'newC' }))

    const agent = request.agent(manageApp())

    await agent
      .post('/prisoner/A1234BC/combine')
      .type('form')
      .send({ containerIds: ['c1', 'c2'] })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/combine/details')

    await agent
      .get('/prisoner/A1234BC/combine/details')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Combine containers')
        expect(res.text).toContain('SN0001')
        expect(res.text).toContain('SN0002')
      })

    await agent
      .post('/prisoner/A1234BC/combine/details')
      .type('form')
      .send({ sealNumber: 'NEW9', containerType: 'STANDARD' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/combine/location')

    await agent
      .post('/prisoner/A1234BC/combine/location')
      .type('form')
      .send({ internalLocationId: 'box1', locationName: 'Reception Store' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/combine/check')

    await agent
      .get('/prisoner/A1234BC/combine/check')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Check your answers')
        expect(res.text).toContain('NEW9')
        expect(res.text).toContain('Reception Store')
      })

    await agent
      .post('/prisoner/A1234BC/combine/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC')

    expect(prisonerPropertyService.combineContainers).toHaveBeenCalledWith(
      {
        sourceContainerIds: ['c1', 'c2'],
        containerType: 'STANDARD',
        sealNumber: 'NEW9',
        internalLocationId: 'box1',
        locationType: 'INTERNAL',
      },
      user.username,
    )
    expect(flashProvider).toHaveBeenCalledWith('success', 'Property containers combined')
    expect(auditService.logPageView).toHaveBeenCalledWith(
      Page.COMBINE_PROPERTY_CONTAINERS,
      expect.objectContaining({
        subjectId: 'A1234BC',
        details: { containerId: 'newC', sourceContainerIds: ['c1', 'c2'] },
      }),
    )
  })

  it('skips the storage-location step for excess (off-site) property', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue(twoContainers())
    prisonerPropertyService.combineContainers.mockResolvedValue(container({ id: 'newC' }))

    const agent = request.agent(manageApp())
    await agent
      .post('/prisoner/A1234BC/combine')
      .type('form')
      .send({ containerIds: ['c1', 'c2'] })

    await agent
      .post('/prisoner/A1234BC/combine/details')
      .type('form')
      .send({ sealNumber: 'NEW9', containerType: 'EXCESS' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/combine/check')

    await agent.post('/prisoner/A1234BC/combine/confirm').type('form').send({}).expect(302)

    expect(prisonerPropertyService.combineContainers).toHaveBeenCalledWith(
      {
        sourceContainerIds: ['c1', 'c2'],
        containerType: 'EXCESS',
        sealNumber: 'NEW9',
        internalLocationId: undefined,
        locationType: 'BRANSTON',
      },
      user.username,
    )
  })

  it('redirects back to details with an error when the new seal number is already in use (409)', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue(twoContainers())
    prisonerPropertyService.combineContainers.mockRejectedValue({ responseStatus: 409 })

    const agent = request.agent(manageApp())
    await agent
      .post('/prisoner/A1234BC/combine')
      .type('form')
      .send({ containerIds: ['c1', 'c2'] })
    await agent
      .post('/prisoner/A1234BC/combine/details')
      .type('form')
      .send({ sealNumber: 'NEW9', containerType: 'EXCESS' })

    await agent
      .post('/prisoner/A1234BC/combine/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC/combine/details')

    expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('seal number'))
  })
})

describe('Change container journey', () => {
  it('renders a Change link on the person view for a user with the manage role', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    return request(manageApp())
      .get('/prisoner/A1234BC')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('/prisoner/A1234BC/change-container/c1?from=person')
      })
  })

  it('forbids the journey for a user without the manage role', async () => {
    withActiveCaseload()

    return request(app)
      .get('/prisoner/A1234BC/change-container/c1')
      .expect(403)
      .expect(() => {
        expect(userService.getActiveCaseload).not.toHaveBeenCalled()
      })
  })

  it('renders the change form prefilled with the current details', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ currentSealNumber: 'SN0001', containerType: 'VALUABLES' }),
    ])

    return request(manageApp())
      .get('/prisoner/A1234BC/change-container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Change property container SN0001')
        expect(res.text).toContain('value="SN0001"')
        expect(res.text).toContain('Remove container')
        expect(res.text).toContain('/prisoner/A1234BC/remove-container/c1?from=person')
      })
  })

  it('re-renders the change form with an error when the seal number is missing', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/change-container/c1')
    return agent
      .post('/prisoner/A1234BC/change-container/c1')
      .type('form')
      .send({ containerType: 'STANDARD', locationChoice: 'current' })
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('There is a problem')
      })
  })

  it('keeps the current location and updates the container', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.updateContainer.mockResolvedValue(container({}))

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/change-container/c1')
    await agent
      .post('/prisoner/A1234BC/change-container/c1')
      .type('form')
      .send({ sealNumber: 'SN0001', containerType: 'VALUABLES', locationChoice: 'current' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/change-container/c1/check')

    await agent
      .get('/prisoner/A1234BC/change-container/c1/check')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Check your answers')
        expect(res.text).toContain('Valuables')
      })

    await agent
      .post('/prisoner/A1234BC/change-container/c1/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC')

    expect(prisonerPropertyService.updateContainer).toHaveBeenCalledWith(
      'c1',
      {
        containerType: 'VALUABLES',
        sealNumber: 'SN0001',
        internalLocationId: undefined,
        proposedDisposalDate: undefined,
      },
      user.username,
    )
    expect(flashProvider).toHaveBeenCalledWith('success', 'Property container updated')
    expect(auditService.logPageView).toHaveBeenCalledWith(
      Page.CHANGE_PROPERTY_CONTAINER,
      expect.objectContaining({ subjectId: 'A1234BC', details: { containerId: 'c1' } }),
    )
  })

  it('walks the new-location path and updates the container with the chosen box', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.getBoxLocations.mockResolvedValue(boxPage([box({ id: 'box1', name: 'Reception Store' })]))
    prisonerPropertyService.updateContainer.mockResolvedValue(container({}))

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/change-container/c1')
    await agent
      .post('/prisoner/A1234BC/change-container/c1')
      .type('form')
      .send({ sealNumber: 'SN0001', containerType: 'STANDARD', locationChoice: 'new' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/change-container/c1/location')

    await agent
      .post('/prisoner/A1234BC/change-container/c1/location')
      .type('form')
      .send({ internalLocationId: 'box1', locationName: 'Reception Store' })
      .expect(302)
      .expect('location', '/prisoner/A1234BC/change-container/c1/check')

    await agent.post('/prisoner/A1234BC/change-container/c1/confirm').type('form').send({}).expect(302)

    expect(prisonerPropertyService.updateContainer).toHaveBeenCalledWith(
      'c1',
      { containerType: 'STANDARD', sealNumber: 'SN0001', internalLocationId: 'box1', proposedDisposalDate: undefined },
      user.username,
    )
  })

  it('redirects back to the change form with an error when the seal number is already in use (409)', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([container({})])
    prisonerPropertyService.updateContainer.mockRejectedValue({ responseStatus: 409 })

    const agent = request.agent(manageApp())
    await agent.get('/prisoner/A1234BC/change-container/c1')
    await agent
      .post('/prisoner/A1234BC/change-container/c1')
      .type('form')
      .send({ sealNumber: 'SN0001', containerType: 'STANDARD', locationChoice: 'current' })

    await agent
      .post('/prisoner/A1234BC/change-container/c1/confirm')
      .type('form')
      .send({})
      .expect(302)
      .expect('location', '/prisoner/A1234BC/change-container/c1')

    expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('seal number'))
  })

  it('shows an overdue disposal warning when the disposal date has passed', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ proposedDisposalDate: '2020-01-01' }),
    ])

    return request(manageApp())
      .get('/prisoner/A1234BC/change-container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('is overdue')
      })
  })

  it('shows a due-for-disposal info banner when the disposal date is in the future', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyForPrisoner.mockResolvedValue([
      container({ proposedDisposalDate: '2999-01-01' }),
    ])

    return request(manageApp())
      .get('/prisoner/A1234BC/change-container/c1')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('due for disposal on')
      })
  })
})

const adminUser = { ...user, userRoles: ['PRISONERPROP__ADMIN'] }
const adminApp = () =>
  appWithAllRoutes({
    services: { auditService, prisonerPropertyService, prisonerService, userService, activeAgenciesService },
    userSupplier: () => adminUser,
  })

describe('Admin - manage enabled prisons', () => {
  const agencies = [
    { agencyId: 'LEI', name: 'Leeds (HMP)', active: false },
    { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true },
  ]

  it('lists all prisons with their on/off state for an admin', async () => {
    prisonerPropertyService.getAllAgencies.mockResolvedValue(agencies)

    return request(adminApp())
      .get('/admin/prisons')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Manage enabled prisons')
        expect(res.text).toContain('Property is switched on for 1 of 2 prisons.')
        expect(res.text).toContain('Leeds (HMP)')
        expect(res.text).toContain('Moorland (HMP &amp; YOI)')
        expect(res.text).toContain('Turn on') // LEI is off
        expect(res.text).toContain('Turn off') // MDI is on
      })
  })

  it('filters the list by search term', async () => {
    prisonerPropertyService.getAllAgencies.mockResolvedValue(agencies)

    return request(adminApp())
      .get('/admin/prisons?q=leeds')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('Leeds (HMP)')
        expect(res.text).not.toContain('Moorland (HMP &amp; YOI)')
      })
  })

  it('forbids the admin console for a user without the admin role', async () => {
    return request(app)
      .get('/admin/prisons')
      .expect(403)
      .expect(() => {
        expect(prisonerPropertyService.getAllAgencies).not.toHaveBeenCalled()
      })
  })

  it('toggles a prison and redirects back with a success message', async () => {
    prisonerPropertyService.setAgencyActive.mockResolvedValue({
      agencyId: 'MDI',
      name: 'Moorland (HMP & YOI)',
      active: false,
    })

    return request(adminApp())
      .post('/admin/prisons/MDI')
      .send({ active: 'false', name: 'Moorland (HMP & YOI)', q: 'moor' })
      .expect(302)
      .expect('location', '/admin/prisons?q=moor')
      .expect(() => {
        expect(prisonerPropertyService.setAgencyActive).toHaveBeenCalledWith('MDI', false, 'user1')
        expect(flashProvider).toHaveBeenCalledWith('success', 'Property is now switched off for Moorland (HMP & YOI).')
        expect(activeAgenciesService.invalidate).toHaveBeenCalled()
      })
  })

  it('forbids toggling for a user without the admin role', async () => {
    return request(app)
      .post('/admin/prisons/MDI')
      .send({ active: 'true' })
      .expect(403)
      .expect(() => {
        expect(prisonerPropertyService.setAgencyActive).not.toHaveBeenCalled()
      })
  })

  it('shows each prison NOMIS property-screen state with the moves it can make', async () => {
    prisonerPropertyService.getAllAgencies.mockResolvedValue(agencies)
    prisonerService.getNomisScreenStates.mockResolvedValue(
      new Map([
        ['MDI', 'BLOCKED'],
        ['LEI', 'WARNING'],
      ]),
    )

    return request(adminApp())
      .get('/admin/prisons')
      .expect(200)
      .expect(res => {
        // MDI is blocked → offers warning + clear, not block
        expect(res.text).toContain('data-qa="nomis-status-MDI"')
        expect(res.text).toContain('data-qa="nomis-clear-MDI"')
        expect(res.text).not.toContain('data-qa="nomis-block-MDI"')
        // LEI shows a warning → offers block + clear
        expect(res.text).toContain('data-qa="nomis-block-LEI"')
        expect(res.text).toContain('data-qa="nomis-clear-LEI"')
      })
  })

  it('degrades to an unavailable notice when the NOMIS screen cannot be read', async () => {
    prisonerPropertyService.getAllAgencies.mockResolvedValue(agencies)
    prisonerService.getNomisScreenStates.mockResolvedValue(null)

    return request(adminApp())
      .get('/admin/prisons')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('data-qa="nomis-unavailable"')
        expect(res.text).toContain('Unknown')
        // no NOMIS action buttons when unavailable
        expect(res.text).not.toContain('data-qa="nomis-block-MDI"')
      })
  })

  it('sets a prison NOMIS screen state and redirects back with a success message', async () => {
    prisonerService.setNomisScreenState.mockResolvedValue(undefined)

    return request(adminApp())
      .post('/admin/prisons/MDI/nomis-screen')
      .send({ state: 'BLOCKED', name: 'Moorland (HMP & YOI)', q: 'moor' })
      .expect(302)
      .expect('location', '/admin/prisons?q=moor')
      .expect(() => {
        expect(prisonerService.setNomisScreenState).toHaveBeenCalledWith('MDI', 'BLOCKED', 'user1')
        expect(flashProvider).toHaveBeenCalledWith(
          'success',
          'NOMIS property access is now blocked for Moorland (HMP & YOI).',
        )
      })
  })

  it('rejects an invalid NOMIS screen state with an error and no API call', async () => {
    return request(adminApp())
      .post('/admin/prisons/MDI/nomis-screen')
      .send({ state: 'NONSENSE', name: 'Moorland (HMP & YOI)' })
      .expect(302)
      .expect(() => {
        expect(prisonerService.setNomisScreenState).not.toHaveBeenCalled()
        expect(flashProvider).toHaveBeenCalledWith('error', 'Select a valid NOMIS property screen state.')
      })
  })

  it('shows a helpful error when the NOMIS splash screen is not set up', async () => {
    prisonerService.setNomisScreenState.mockRejectedValue(new NomisScreenNotSetUpError())

    return request(adminApp())
      .post('/admin/prisons/MDI/nomis-screen')
      .send({ state: 'WARNING', name: 'Moorland (HMP & YOI)' })
      .expect(302)
      .expect(() => {
        expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('has not been set up yet'))
      })
  })

  it('forbids the NOMIS screen control for a user without the admin role', async () => {
    return request(app)
      .post('/admin/prisons/MDI/nomis-screen')
      .send({ state: 'BLOCKED' })
      .expect(403)
      .expect(() => {
        expect(prisonerService.setNomisScreenState).not.toHaveBeenCalled()
      })
  })

  it('shows the manage-prisons link on the establishment list for an admin', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(adminApp())
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('/admin/prisons')
        expect(res.text).toContain('Manage enabled prisons')
      })
  })

  it('hides the manage-prisons link from a non-admin', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(app)
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).not.toContain('/admin/prisons')
      })
  })
})

const locationAdminUser = { ...user, userRoles: ['PRISONERPROP__LOCATION_ADMIN'] }
const locationAdminApp = () =>
  appWithAllRoutes({
    services: { auditService, prisonerPropertyService, prisonerService, userService, activeAgenciesService },
    userSupplier: () => locationAdminUser,
  })

describe('Admin - manage storage locations', () => {
  const locations = [
    {
      id: 'loc-1',
      prisonId: 'MDI',
      code: 'PROP1',
      name: 'Reception Store',
      locationType: 'BOX',
      capacity: 10,
      containersHeld: 3,
      availableSpaces: 7,
    },
  ]

  it('lists the property storage locations for the active caseload', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPropertyLocations.mockResolvedValue(locations)

    return request(locationAdminApp())
      .get('/admin/locations')
      .expect(200)
      .expect(res => {
        expect(prisonerPropertyService.getPropertyLocations).toHaveBeenCalledWith('MDI', 'user1')
        expect(res.text).toContain('Manage storage locations')
        expect(res.text).toContain('Reception Store')
        expect(res.text).toContain('Add a storage location')
      })
  })

  it('forbids the screens for a user without the location-admin role', async () => {
    return request(app)
      .get('/admin/locations')
      .expect(403)
      .expect(() => {
        expect(prisonerPropertyService.getPropertyLocations).not.toHaveBeenCalled()
      })
  })

  it('rejects an add with a missing name or capacity', async () => {
    withActiveCaseload()

    return request(locationAdminApp())
      .post('/admin/locations/add')
      .send({ localName: '', capacity: '' })
      .expect(400)
      .expect(res => {
        expect(res.text).toContain('Enter a name for the storage location')
        expect(res.text).toContain('Enter how many containers this location can hold')
        expect(prisonerPropertyService.createPropertyLocation).not.toHaveBeenCalled()
      })
  })

  it('rejects a non-numeric capacity', async () => {
    withActiveCaseload()

    return request(locationAdminApp())
      .post('/admin/locations/add')
      .send({ localName: 'Reception Store', capacity: 'lots' })
      .expect(400)
      .expect(res => {
        expect(res.text).toContain('Capacity must be a whole number')
        expect(prisonerPropertyService.createPropertyLocation).not.toHaveBeenCalled()
      })
  })

  it('adds a storage location and redirects with a success message', async () => {
    withActiveCaseload()
    prisonerPropertyService.createPropertyLocation.mockResolvedValue(locations[0])

    return request(locationAdminApp())
      .post('/admin/locations/add')
      .send({ localName: 'Reception Store', capacity: '10' })
      .expect(302)
      .expect('location', '/admin/locations')
      .expect(() => {
        expect(prisonerPropertyService.createPropertyLocation).toHaveBeenCalledWith(
          'MDI',
          { localName: 'Reception Store', capacity: 10 },
          'user1',
        )
        expect(flashProvider).toHaveBeenCalledWith('success', expect.stringContaining('added'))
      })
  })

  it('re-renders the add form when the name already exists', async () => {
    withActiveCaseload()
    prisonerPropertyService.createPropertyLocation.mockRejectedValue({ responseStatus: 409 })

    return request(locationAdminApp())
      .post('/admin/locations/add')
      .send({ localName: 'Reception Store', capacity: '10' })
      .expect(400)
      .expect(res => {
        expect(res.text).toContain('A storage location with this name already exists')
      })
  })

  it('updates a storage location and redirects', async () => {
    prisonerPropertyService.updatePropertyLocation.mockResolvedValue(locations[0])

    return request(locationAdminApp())
      .post('/admin/locations/loc-1/edit')
      .send({ localName: 'Reception Store', capacity: '25' })
      .expect(302)
      .expect('location', '/admin/locations')
      .expect(() => {
        expect(prisonerPropertyService.updatePropertyLocation).toHaveBeenCalledWith(
          'loc-1',
          { localName: 'Reception Store', capacity: 25 },
          'user1',
        )
      })
  })

  it('removes an empty storage location and redirects with a success message', async () => {
    prisonerPropertyService.removePropertyLocation.mockResolvedValue(locations[0])

    return request(locationAdminApp())
      .post('/admin/locations/loc-1/remove')
      .expect(302)
      .expect('location', '/admin/locations')
      .expect(() => {
        expect(prisonerPropertyService.removePropertyLocation).toHaveBeenCalledWith('loc-1', 'user1')
        expect(flashProvider).toHaveBeenCalledWith('success', 'Storage location removed.')
      })
  })

  it('flashes an error when removing a location that still holds property', async () => {
    prisonerPropertyService.removePropertyLocation.mockRejectedValue({ responseStatus: 409 })

    return request(locationAdminApp())
      .post('/admin/locations/loc-1/remove')
      .expect(302)
      .expect('location', '/admin/locations')
      .expect(() => {
        expect(flashProvider).toHaveBeenCalledWith('error', expect.stringContaining('cannot be removed'))
      })
  })

  it('shows the manage-storage-locations link for a location admin', async () => {
    withActiveCaseload()
    prisonerPropertyService.getPrisonProperty.mockResolvedValue(emptyPage)

    return request(locationAdminApp())
      .get('/')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('/admin/locations')
        expect(res.text).toContain('Manage storage locations')
      })
  })
})

import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerPropertyApiClient from './prisonerPropertyApiClient'
import config from '../config'
import type { PrisonerPropertyContainer, PrisonerPropertyGroup } from './prisonerPropertyApiTypes'

describe('PrisonerPropertyApiClient', () => {
  let prisonerPropertyApiClient: PrisonerPropertyApiClient
  let mockAuthenticationClient: jest.Mocked<AuthenticationClient>

  beforeEach(() => {
    mockAuthenticationClient = {
      getToken: jest.fn().mockResolvedValue('test-system-token'),
    } as unknown as jest.Mocked<AuthenticationClient>

    prisonerPropertyApiClient = new PrisonerPropertyApiClient(mockAuthenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
  })

  describe('getPropertyForPrisoner', () => {
    it('should GET the prisoner containers using a system token for the user and return the body', async () => {
      const containers = [{ id: '0196f1d3-9a1f-7c3a-9b2e-2c1f3a4b5c6d', prisonerNumber: 'A1234BC' }]

      nock(config.apis.prisonerPropertyApi.url)
        .get('/property-containers/prisoner/A1234BC')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, containers)

      const response = await prisonerPropertyApiClient.getPropertyForPrisoner('A1234BC', 'AUSER_GEN')

      expect(response).toEqual(containers as PrisonerPropertyContainer[])
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('getPrisonPropertySummary', () => {
    it('should GET the prison property summary using a system token for the user and return the body', async () => {
      const summary = {
        availableStorageSpaces: 150,
        storedOnSite: 3000,
        dueToTransferOut: 80,
        dueToBeReturned: 0,
        dueToBeDisposed: 40,
      }

      nock(config.apis.prisonerPropertyApi.url)
        .get('/property-containers/prison/MDI/summary')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, summary)

      const response = await prisonerPropertyApiClient.getPrisonPropertySummary('MDI', 'AUSER_GEN')

      expect(response).toEqual(summary)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('getPrisonProperty', () => {
    it('should GET the prison property page with filters/paging as query params using a system token', async () => {
      const pageBody = { content: [] as PrisonerPropertyGroup[], totalElements: 0, totalPages: 0, number: 0, size: 20 }

      nock(config.apis.prisonerPropertyApi.url)
        .get('/property-containers/prison/MDI')
        .query({
          query: 'A1234BC',
          containerType: 'STANDARD',
          status: 'STORED',
          includeRemoved: 'true',
          page: '0',
          size: '20',
        })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, pageBody)

      const response = await prisonerPropertyApiClient.getPrisonProperty(
        'MDI',
        { query: 'A1234BC', containerType: ['STANDARD'], status: ['STORED'], includeRemoved: true, page: 0, size: 20 },
        'AUSER_GEN',
      )

      expect(response).toEqual(pageBody)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('getAllAgencies', () => {
    it('should GET all prisons with their active state using a system token for the user', async () => {
      const agencies = [
        { agencyId: 'LEI', name: 'Leeds (HMP)', active: false },
        { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true },
      ]

      nock(config.apis.prisonerPropertyApi.url)
        .get('/active-agencies/all')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, agencies)

      const response = await prisonerPropertyApiClient.getAllAgencies('AUSER_GEN')

      expect(response).toEqual(agencies)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('setAgencyActive', () => {
    it('should PUT the new active state using a system token for the user', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .put('/active-agencies/MDI', { active: true })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true })

      const response = await prisonerPropertyApiClient.setAgencyActive('MDI', true, 'AUSER_GEN')

      expect(response).toEqual({ agencyId: 'MDI', name: 'Moorland (HMP & YOI)', active: true })
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('legacy clean-up', () => {
    const job = {
      id: 'job-1',
      prisonId: 'LEI',
      status: 'PENDING',
      olderThanDays: 28,
      cutoffDate: '2026-08-14',
      requestedBy: 'AUSER_GEN',
      requestedAt: '2026-09-11T10:00:00',
      startTime: null as string | null,
      endTime: null as string | null,
      totalRecords: 3,
      processedRecords: 0,
      returnedRecords: 0,
      transferredRecords: 0,
      skippedRecords: 0,
      failedRecords: 0,
    }

    it('previewLegacyCleanup GETs the preview for the window with a system token for the user', async () => {
      const preview = { prisonId: 'LEI', olderThanDays: 14, toReturn: { containers: 2, prisoners: 1 } }
      nock(config.apis.prisonerPropertyApi.url)
        .get('/active-agencies/LEI/cleanup/preview')
        .query({ olderThanDays: 14 })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, preview)

      const response = await prisonerPropertyApiClient.previewLegacyCleanup('LEI', 14, 'AUSER_GEN')

      expect(response).toEqual(preview)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })

    it('startLegacyCleanup POSTs the window and returns the accepted job', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .post('/active-agencies/LEI/cleanup', { olderThanDays: 28 })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(202, job)

      const response = await prisonerPropertyApiClient.startLegacyCleanup('LEI', 28, 'AUSER_GEN')

      expect(response).toEqual(job)
    })

    it('startLegacyCleanup surfaces a 409 when a clean-up is already in flight', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .post('/active-agencies/LEI/cleanup')
        .reply(409, { status: 409, userMessage: 'A legacy clean-up is already in progress for LEI' })

      await expect(prisonerPropertyApiClient.startLegacyCleanup('LEI', 28, 'AUSER_GEN')).rejects.toMatchObject({
        responseStatus: 409,
      })
    })

    it('getLegacyCleanupJobs and getLegacyCleanupJob GET the jobs', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .get('/active-agencies/LEI/cleanup')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, [job])
        .get('/active-agencies/cleanup/job-1')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { ...job, items: [] })

      expect(await prisonerPropertyApiClient.getLegacyCleanupJobs('LEI', 'AUSER_GEN')).toEqual([job])
      expect(await prisonerPropertyApiClient.getLegacyCleanupJob('job-1', 'AUSER_GEN')).toEqual({ ...job, items: [] })
    })
  })

  describe('property location management', () => {
    const location = {
      id: 'loc-1',
      prisonId: 'MDI',
      code: 'PROP1',
      name: 'Reception Store',
      locationType: 'BOX',
      capacity: 10,
      containersHeld: 0,
      availableSpaces: 10,
    }

    it('should GET the property locations for a prison using a system token', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .get('/property-locations/prison/MDI')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, [location])

      expect(await prisonerPropertyApiClient.getPropertyLocations('MDI', 'AUSER_GEN')).toEqual([location])
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })

    it('should POST a new property location using a system token', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .post('/property-locations/prison/MDI', { localName: 'Reception Store', capacity: 10 })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(201, location)

      const response = await prisonerPropertyApiClient.createPropertyLocation(
        'MDI',
        { localName: 'Reception Store', capacity: 10 },
        'AUSER_GEN',
      )
      expect(response).toEqual(location)
    })

    it('should PUT an update to a property location using a system token', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .put('/property-locations/loc-1', { capacity: 25 })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { ...location, capacity: 25, availableSpaces: 25 })

      const response = await prisonerPropertyApiClient.updatePropertyLocation('loc-1', { capacity: 25 }, 'AUSER_GEN')
      expect(response.capacity).toEqual(25)
    })

    it('should DELETE a property location using a system token', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .delete('/property-locations/loc-1')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, location)

      const response = await prisonerPropertyApiClient.removePropertyLocation('loc-1', 'AUSER_GEN')
      expect(response).toEqual(location)
    })
  })

  describe('getActiveAgencyIds', () => {
    it('should GET the public /info endpoint unauthenticated and return the activeAgencies array', async () => {
      nock(config.apis.prisonerPropertyApi.url)
        .get('/info')
        .reply(200, { activeAgencies: ['MDI', 'LEI'] })

      const response = await prisonerPropertyApiClient.getActiveAgencyIds()

      expect(response).toEqual(['MDI', 'LEI'])
      // /info is public: no token is fetched for this call
      expect(mockAuthenticationClient.getToken).not.toHaveBeenCalled()
    })

    it('should default to an empty array when /info has no activeAgencies key', async () => {
      nock(config.apis.prisonerPropertyApi.url).get('/info').reply(200, {})

      expect(await prisonerPropertyApiClient.getActiveAgencyIds()).toEqual([])
    })
  })
})

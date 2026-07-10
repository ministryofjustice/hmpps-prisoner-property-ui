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

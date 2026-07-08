import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerSearchApiClient from './prisonerSearchApiClient'
import config from '../config'
import type { Prisoner } from './prisonerSearchApiTypes'

describe('PrisonerSearchApiClient', () => {
  let prisonerSearchApiClient: PrisonerSearchApiClient
  let mockAuthenticationClient: jest.Mocked<AuthenticationClient>

  beforeEach(() => {
    mockAuthenticationClient = {
      getToken: jest.fn().mockResolvedValue('test-system-token'),
    } as unknown as jest.Mocked<AuthenticationClient>

    prisonerSearchApiClient = new PrisonerSearchApiClient(mockAuthenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
  })

  describe('getPrisoner', () => {
    it('should GET the prisoner using a system token for the user and return the body', async () => {
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

      nock(config.apis.prisonerSearchApi.url)
        .get('/prisoner/A1234BC')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, prisoner)

      const response = await prisonerSearchApiClient.getPrisoner('A1234BC', 'AUSER_GEN')

      expect(response).toEqual(prisoner)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })

  describe('searchPrisoners', () => {
    it('POSTs a keyword search scoped to the prison, with the term in andWords and pagination in the body', async () => {
      let capturedBody: Record<string, unknown> = {}
      nock(config.apis.prisonerSearchApi.url)
        .post('/keyword', body => {
          capturedBody = body
          return true
        })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 })

      await prisonerSearchApiClient.searchPrisoners('Sonom', 'MDI', 2, 20, 'AUSER_GEN')

      expect(capturedBody).toEqual({
        andWords: 'Sonom',
        fuzzyMatch: true,
        prisonIds: ['MDI'],
        pagination: { page: 2, size: 20 },
      })
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })
})

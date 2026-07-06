import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonApiClient from './prisonApiClient'
import config from '../config'

describe('PrisonApiClient', () => {
  let prisonApiClient: PrisonApiClient
  let mockAuthenticationClient: jest.Mocked<AuthenticationClient>

  beforeEach(() => {
    mockAuthenticationClient = {
      getToken: jest.fn().mockResolvedValue('test-system-token'),
    } as unknown as jest.Mocked<AuthenticationClient>

    prisonApiClient = new PrisonApiClient(mockAuthenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
  })

  describe('getPrisonerImage', () => {
    it('should stream the prisoner image by offender number using a system token for the user', async () => {
      nock(config.apis.prisonApi.url)
        .get('/api/bookings/offenderNo/A1234BC/image/data')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, Buffer.from('image-bytes'), { 'Content-Type': 'image/jpeg' })

      const stream = await prisonApiClient.getPrisonerImage('A1234BC', 'AUSER_GEN')

      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer)
      }
      expect(Buffer.concat(chunks).toString()).toEqual('image-bytes')
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })
})

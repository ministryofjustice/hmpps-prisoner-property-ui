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

  describe('splash-screen', () => {
    it('should GET a splash screen for a module using a system token', async () => {
      const screen = {
        moduleName: 'OIDMPCON',
        conditions: [{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true }],
      }
      nock(config.apis.prisonApi.url)
        .get('/api/splash-screen/OIDMPCON')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, screen)

      const response = await prisonApiClient.getSplashScreen('OIDMPCON', 'AUSER_GEN')

      expect(response).toEqual(screen)
      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })

    it('should POST a new condition using a system token', async () => {
      nock(config.apis.prisonApi.url)
        .post('/api/splash-screen/OIDMPCON/condition', {
          conditionType: 'CASELOAD',
          conditionValue: 'MDI',
          blockAccess: true,
        })
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { moduleName: 'OIDMPCON', conditions: [] })

      await prisonApiClient.addSplashCondition('OIDMPCON', 'CASELOAD', 'MDI', true, 'AUSER_GEN')

      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })

    it('should PUT a condition update with the block-access flag in the path', async () => {
      nock(config.apis.prisonApi.url)
        .put('/api/splash-screen/OIDMPCON/condition/CASELOAD/MDI/false')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200, { moduleName: 'OIDMPCON', conditions: [] })

      await prisonApiClient.updateSplashCondition('OIDMPCON', 'CASELOAD', 'MDI', false, 'AUSER_GEN')

      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })

    it('should DELETE a condition using a system token', async () => {
      nock(config.apis.prisonApi.url)
        .delete('/api/splash-screen/OIDMPCON/condition/CASELOAD/MDI')
        .matchHeader('authorization', 'Bearer test-system-token')
        .reply(200)

      await prisonApiClient.removeSplashCondition('OIDMPCON', 'CASELOAD', 'MDI', 'AUSER_GEN')

      expect(mockAuthenticationClient.getToken).toHaveBeenCalledWith('AUSER_GEN')
    })
  })
})

import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerSearchApiClient from '../data/prisonerSearchApiClient'
import PrisonApiClient from '../data/prisonApiClient'
import PrisonerService from './prisonerService'
import { NomisScreenNotSetUpError } from '../utils/nomisSplash'
import type { SplashScreen } from '../data/prisonApiTypes'

jest.mock('../data/prisonerSearchApiClient')
jest.mock('../data/prisonApiClient')

describe('PrisonerService - NOMIS splash screen', () => {
  const prisonerSearchApiClient = new PrisonerSearchApiClient(
    {} as AuthenticationClient,
  ) as jest.Mocked<PrisonerSearchApiClient>
  const prisonApiClient = new PrisonApiClient({} as AuthenticationClient) as jest.Mocked<PrisonApiClient>
  let service: PrisonerService

  const screen = (conditions: SplashScreen['conditions']): SplashScreen => ({ moduleName: 'OIDMPCON', conditions })

  beforeEach(() => {
    service = new PrisonerService(prisonerSearchApiClient, prisonApiClient)
  })

  afterEach(() => jest.resetAllMocks())

  describe('getNomisScreenStates', () => {
    it('maps caseload conditions to Blocked/Warning states', async () => {
      prisonApiClient.getSplashScreen.mockResolvedValue(
        screen([
          { conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true },
          { conditionType: 'CASELOAD', conditionValue: 'LEI', blockAccess: false },
          { conditionType: 'USER', conditionValue: 'BOB', blockAccess: true },
        ]),
      )

      const states = await service.getNomisScreenStates('AUSER')

      expect(states).toEqual(
        new Map([
          ['MDI', 'BLOCKED'],
          ['LEI', 'WARNING'],
        ]),
      )
    })

    it('returns null when the screen cannot be read (not set up / role / down)', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue(new Error('404'))

      expect(await service.getNomisScreenStates('AUSER')).toBeNull()
    })
  })

  describe('setNomisScreenState', () => {
    it('adds a blocking condition when the prison is currently Normal', async () => {
      prisonApiClient.getSplashScreen.mockResolvedValue(screen([]))

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.addSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
    })

    it('updates the existing condition when moving Warning -> Blocked', async () => {
      prisonApiClient.getSplashScreen.mockResolvedValue(
        screen([{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: false }]),
      )

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.updateSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.addSplashCondition).not.toHaveBeenCalled()
    })

    it('removes the condition when clearing to Normal', async () => {
      prisonApiClient.getSplashScreen.mockResolvedValue(
        screen([{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true }]),
      )

      await service.setNomisScreenState('MDI', 'NORMAL', 'AUSER')

      expect(prisonApiClient.removeSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', 'AUSER')
    })

    it('does nothing when already in the target state', async () => {
      prisonApiClient.getSplashScreen.mockResolvedValue(
        screen([{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true }]),
      )

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.addSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.removeSplashCondition).not.toHaveBeenCalled()
    })

    it('throws NomisScreenNotSetUpError when the screen does not exist (404)', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue({ responseStatus: 404 })

      await expect(service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')).rejects.toBeInstanceOf(
        NomisScreenNotSetUpError,
      )
    })

    it('rethrows non-404 read failures', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue({ responseStatus: 500 })

      await expect(service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')).rejects.toEqual({ responseStatus: 500 })
    })
  })
})

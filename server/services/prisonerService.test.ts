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

  const screen = (moduleName: string, conditions: SplashScreen['conditions']): SplashScreen => ({
    moduleName,
    conditions,
  })

  // Stub each property screen's conditions by module; a module mapped to an Error-like value rejects.
  const stubScreens = (screens: Record<string, SplashScreen['conditions'] | { responseStatus: number }>) =>
    prisonApiClient.getSplashScreen.mockImplementation(async (module: string) => {
      const value = screens[module]
      if (!Array.isArray(value)) throw value
      return screen(module, value)
    })

  const mdiCondition = (blockAccess: boolean) => [{ conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess }]

  beforeEach(() => {
    service = new PrisonerService(prisonerSearchApiClient, prisonApiClient)
  })

  afterEach(() => jest.resetAllMocks())

  describe('getNomisScreenStates', () => {
    it('maps the OIDMPCON caseload conditions to Blocked/Warning states', async () => {
      stubScreens({
        OIDMPCON: [
          { conditionType: 'CASELOAD', conditionValue: 'MDI', blockAccess: true },
          { conditionType: 'CASELOAD', conditionValue: 'LEI', blockAccess: false },
          { conditionType: 'USER', conditionValue: 'BOB', blockAccess: true },
        ],
        OIUPROPE: [],
      })

      const states = await service.getNomisScreenStates('AUSER')

      expect(states).toEqual(
        new Map([
          ['MDI', 'BLOCKED'],
          ['LEI', 'WARNING'],
        ]),
      )
      expect(prisonApiClient.getSplashScreen).toHaveBeenCalledWith('OIDMPCON', 'AUSER')
      expect(prisonApiClient.getSplashScreen).toHaveBeenCalledWith('OIUPROPE', 'AUSER')
    })

    it('returns null when the screen cannot be read (not set up / role / down)', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue(new Error('404'))

      expect(await service.getNomisScreenStates('AUSER')).toBeNull()
    })

    it('returns null when only the OIUPROPE screen cannot be read', async () => {
      stubScreens({ OIDMPCON: mdiCondition(true), OIUPROPE: { responseStatus: 404 } })

      expect(await service.getNomisScreenStates('AUSER')).toBeNull()
    })
  })

  describe('setNomisScreenState', () => {
    it('adds a blocking condition to both screens when the prison is currently Normal', async () => {
      stubScreens({ OIDMPCON: [], OIUPROPE: [] })

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.addSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.addSplashCondition).toHaveBeenCalledWith('OIUPROPE', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
    })

    it('updates the existing condition on both screens when moving Warning -> Blocked', async () => {
      stubScreens({ OIDMPCON: mdiCondition(false), OIUPROPE: mdiCondition(false) })

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.updateSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.updateSplashCondition).toHaveBeenCalledWith('OIUPROPE', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.addSplashCondition).not.toHaveBeenCalled()
    })

    it('removes the condition from both screens when clearing to Normal', async () => {
      stubScreens({ OIDMPCON: mdiCondition(true), OIUPROPE: mdiCondition(true) })

      await service.setNomisScreenState('MDI', 'NORMAL', 'AUSER')

      expect(prisonApiClient.removeSplashCondition).toHaveBeenCalledWith('OIDMPCON', 'CASELOAD', 'MDI', 'AUSER')
      expect(prisonApiClient.removeSplashCondition).toHaveBeenCalledWith('OIUPROPE', 'CASELOAD', 'MDI', 'AUSER')
    })

    it('does nothing when both screens are already in the target state', async () => {
      stubScreens({ OIDMPCON: mdiCondition(true), OIUPROPE: mdiCondition(true) })

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.addSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.removeSplashCondition).not.toHaveBeenCalled()
    })

    it('changes only the screen that is out of step', async () => {
      // e.g. a prison blocked before OIUPROPE was managed: OIDMPCON blocked, OIUPROPE normal
      stubScreens({ OIDMPCON: mdiCondition(true), OIUPROPE: [] })

      await service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')

      expect(prisonApiClient.addSplashCondition).toHaveBeenCalledTimes(1)
      expect(prisonApiClient.addSplashCondition).toHaveBeenCalledWith('OIUPROPE', 'CASELOAD', 'MDI', true, 'AUSER')
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
    })

    it('throws NomisScreenNotSetUpError when the screen does not exist (404)', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue({ responseStatus: 404 })

      await expect(service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')).rejects.toBeInstanceOf(
        NomisScreenNotSetUpError,
      )
    })

    it('names the missing screen and changes neither screen when only OIUPROPE is not set up', async () => {
      stubScreens({ OIDMPCON: [], OIUPROPE: { responseStatus: 404 } })

      await expect(service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')).rejects.toMatchObject({
        name: 'NomisScreenNotSetUpError',
        moduleName: 'OIUPROPE',
      })
      expect(prisonApiClient.addSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.updateSplashCondition).not.toHaveBeenCalled()
      expect(prisonApiClient.removeSplashCondition).not.toHaveBeenCalled()
    })

    it('rethrows non-404 read failures', async () => {
      prisonApiClient.getSplashScreen.mockRejectedValue({ responseStatus: 500 })

      await expect(service.setNomisScreenState('MDI', 'BLOCKED', 'AUSER')).rejects.toEqual({ responseStatus: 500 })
    })
  })
})

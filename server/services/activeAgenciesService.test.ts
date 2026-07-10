import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PrisonerPropertyApiClient from '../data/prisonerPropertyApiClient'
import ActiveAgenciesService from './activeAgenciesService'

jest.mock('../data/prisonerPropertyApiClient')

describe('ActiveAgenciesService', () => {
  const prisonerPropertyApiClient = new PrisonerPropertyApiClient(
    {} as AuthenticationClient,
  ) as jest.Mocked<PrisonerPropertyApiClient>
  let service: ActiveAgenciesService

  beforeEach(() => {
    service = new ActiveAgenciesService(prisonerPropertyApiClient)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  it('resolves whether a prison is active from the API', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI', 'LEI'])

    expect(await service.isPrisonActive('MDI')).toBe(true)
    expect(await service.isPrisonActive('WWI')).toBe(false)
  })

  it('treats an empty prison id as not active', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI'])

    expect(await service.isPrisonActive('')).toBe(false)
    // no lookup needed for a missing caseload
    expect(prisonerPropertyApiClient.getActiveAgencyIds).not.toHaveBeenCalled()
  })

  it('serves from cache within the TTL, making a single HTTP call', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI'])

    await service.isPrisonActive('MDI')
    await service.isPrisonActive('MDI')

    expect(prisonerPropertyApiClient.getActiveAgencyIds).toHaveBeenCalledTimes(1)
  })

  it('refreshes from the API once the TTL expires', async () => {
    jest.useFakeTimers()
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI'])

    await service.getActiveAgencyIds()
    jest.advanceTimersByTime(5 * 60 * 1000 + 1)
    await service.getActiveAgencyIds()

    expect(prisonerPropertyApiClient.getActiveAgencyIds).toHaveBeenCalledTimes(2)
  })

  it('refreshes from the API after invalidate()', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI'])

    await service.getActiveAgencyIds()
    service.invalidate()
    await service.getActiveAgencyIds()

    expect(prisonerPropertyApiClient.getActiveAgencyIds).toHaveBeenCalledTimes(2)
  })

  it('never throws: falls back to the last-known set when a refresh fails', async () => {
    jest.useFakeTimers()
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce(['MDI'])
    await service.getActiveAgencyIds()

    jest.advanceTimersByTime(5 * 60 * 1000 + 1)
    prisonerPropertyApiClient.getActiveAgencyIds.mockRejectedValueOnce(new Error('503'))

    expect(await service.isPrisonActive('MDI')).toBe(true)
  })

  it('never throws: returns an empty set when the very first load fails', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockRejectedValue(new Error('503'))

    expect(await service.isPrisonActive('MDI')).toBe(false)
  })
})

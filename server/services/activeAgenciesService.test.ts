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

  it('reads the API on every lookup rather than caching', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValue(['MDI'])

    await service.isPrisonActive('MDI')
    await service.isPrisonActive('MDI')

    expect(prisonerPropertyApiClient.getActiveAgencyIds).toHaveBeenCalledTimes(2)
  })

  // The bug this replaced: a per-pod cache could not be invalidated from the pod that served the admin's
  // toggle, so other pods refused writes for a prison that was switched on until their TTL expired.
  it('sees a prison switched on by another pod immediately', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce([])
    expect(await service.isPrisonActive('MDI')).toBe(false)

    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce(['MDI'])
    expect(await service.isPrisonActive('MDI')).toBe(true)
  })

  it('sees a prison switched off by another pod immediately', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce(['MDI'])
    expect(await service.isPrisonActive('MDI')).toBe(true)

    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce([])
    expect(await service.isPrisonActive('MDI')).toBe(false)
  })

  it('never throws: falls back to the last-known set when a read fails', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce(['MDI'])
    await service.getActiveAgencyIds()

    prisonerPropertyApiClient.getActiveAgencyIds.mockRejectedValueOnce(new Error('503'))

    expect(await service.isPrisonActive('MDI')).toBe(true)
  })

  it('stops using the fallback as soon as the API answers again', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce(['MDI'])
    await service.getActiveAgencyIds()

    prisonerPropertyApiClient.getActiveAgencyIds.mockRejectedValueOnce(new Error('503'))
    expect(await service.isPrisonActive('MDI')).toBe(true)

    prisonerPropertyApiClient.getActiveAgencyIds.mockResolvedValueOnce([])
    expect(await service.isPrisonActive('MDI')).toBe(false)
  })

  it('never throws: returns an empty set when the very first load fails', async () => {
    prisonerPropertyApiClient.getActiveAgencyIds.mockRejectedValue(new Error('503'))

    expect(await service.isPrisonActive('MDI')).toBe(false)
  })
})

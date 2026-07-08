import type { SuperAgentRequest } from 'superagent'
import { stubFor, stubPing } from './wiremock'
import type { Prisoner } from '../../server/data/prisonerSearchApiTypes'

// A tiny valid 1x1 JPEG, returned when a 200 prisoner image is stubbed.
const ONE_PIXEL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=='

const defaultPrisoner: Prisoner = {
  prisonerNumber: 'A1234BC',
  firstName: 'John',
  lastName: 'Smith',
  dateOfBirth: '2001-01-01',
  prisonId: 'MDI',
  prisonName: 'Moorland (HMP & YOI)',
  cellLocation: 'F-3-042',
  status: 'ACTIVE IN',
}

export default {
  stubPrisonerSearchPing: (httpStatus = 200): SuperAgentRequest => stubPing('/prisoner-search-api', httpStatus),
  stubPrisonApiPing: (httpStatus = 200): SuperAgentRequest => stubPing('/prison-api', httpStatus),

  stubGetPrisoner: (
    { prisoner = defaultPrisoner, priority = undefined as number | undefined } = {},
    httpStatus = 200,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prisoner-search-api/prisoner/${prisoner.prisonerNumber}`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: prisoner,
      },
    }),

  // Stub the keyword search (POST /keyword) - matches on path so any term/prison returns these prisoners.
  stubSearchPrisoners: ({
    prisoners = [defaultPrisoner],
    priority = undefined as number | undefined,
  } = {}): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'POST',
        urlPath: `/prisoner-search-api/keyword`,
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        jsonBody: {
          content: prisoners,
          totalElements: prisoners.length,
          totalPages: prisoners.length ? 1 : 0,
          number: 0,
          size: 50,
          numberOfElements: prisoners.length,
          first: true,
          last: true,
        },
      },
    }),

  // Stub a prisoner image. Defaults to a 404 so the app falls back to the "Photo withheld" placeholder.
  stubGetPrisonerImage: (
    { prisonerNumber = 'A1234BC', priority = undefined as number | undefined } = {},
    httpStatus = 404,
  ): SuperAgentRequest =>
    stubFor({
      priority,
      request: {
        method: 'GET',
        urlPath: `/prison-api/api/bookings/offenderNo/${prisonerNumber}/image/data`,
      },
      response: {
        status: httpStatus,
        headers: { 'Content-Type': httpStatus === 200 ? 'image/jpeg' : 'application/json;charset=UTF-8' },
        base64Body: httpStatus === 200 ? ONE_PIXEL_JPEG_BASE64 : undefined,
      },
    }),
}

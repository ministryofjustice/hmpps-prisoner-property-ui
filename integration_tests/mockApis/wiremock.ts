import superagent, { SuperAgentRequest, Response } from 'superagent'

const url = 'http://localhost:9091/__admin'

/**
 * Incomplete definition of options used for creating a new stub mapping
 * https://wiremock.org/docs/standalone/admin-api-reference/#tag/Stub-Mappings/operation/createNewStubMapping
 */
interface Mapping {
  priority?: number
  request?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    queryParameters?: Record<string, { equalTo: string } | { matches: string }>
    bodyPatterns?: ({ contains: string } | { equalToJson: unknown })[]
  } & ({ url?: string } | { urlPath: string } | { urlPathPattern: string } | { urlPattern: string })
  response?: {
    status?: number
    headers?: Record<string, string>
  } & ({ jsonBody?: unknown } | { body: string } | { base64Body: string })
}

export const stubFor = (mapping: Mapping): SuperAgentRequest => superagent.post(`${url}/mappings`).send(mapping)

export const stubPing = (urlPrefix: string, httpStatus = 200): SuperAgentRequest =>
  stubFor({
    request: {
      method: 'GET',
      urlPath: `${urlPrefix}/health/ping`,
    },
    response: {
      status: httpStatus,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      jsonBody: { status: httpStatus === 200 ? 'UP' : 'DOWN' },
    },
  })

/**
 * Incomplete definition of options used for searching requests
 * https://wiremock.org/docs/standalone/admin-api-reference/#tag/Requests/operation/findRequestsByCriteria
 */
type FindRequestCriteria = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
} & ({ url?: string } | { urlPath: string } | { urlPathPattern: string } | { urlPattern: string })

/**
 * Incomplete definition of requests found
 * https://wiremock.org/docs/standalone/admin-api-reference/#tag/Requests/operation/findRequestsByCriteria
 */
interface FoundRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  url: string
  absoluteUrl: string
  headers: Record<string, string>
  queryParams: Record<string, { key: string; values: string[] }>
  body: string
  bodyAsBase64: string
}

export const getMatchingRequests = (body: FindRequestCriteria): Promise<FoundRequest[]> =>
  superagent
    .post(`${url}/requests/find`)
    .send(body)
    .then(data => data.body.requests)

/** the audit SQS queue; the client posts SendMessage to the root path of AUDIT_SQS_QUEUE_URL */
export const stubAuditSqs = (): SuperAgentRequest =>
  stubFor({
    request: { method: 'POST', url: '/' },
    response: { status: 200, headers: { 'Content-Type': 'text/xml' }, body: '{}' },
  })

/**
 * An audit message as it appears on the queue. Note the wire format keeps the field names from
 * v1 of the audit client: the event's `action` is sent as `what`, and `details` is a JSON string.
 */
export interface SentAuditEvent {
  what: string
  who: string
  service: string
  subjectType?: string
  subjectId?: string
  details?: string
}

/**
 * Audit events sent to the stubbed SQS endpoint, oldest first.
 *
 * Events are identified by their SQS SendMessage payload rather than by position, so that
 * unrelated requests cannot shift the results.
 *
 * The app sends them fire-and-forget – and the access attempt only once the response has
 * closed – so this waits for `expectedCount` of them to arrive before returning.
 */
export const getSentAuditEvents = async (expectedCount = 0): Promise<SentAuditEvent[]> => {
  const readSentEvents = async (): Promise<SentAuditEvent[]> => {
    const requests = await getMatchingRequests({ method: 'POST', urlPath: '/' })
    return requests
      .filter(({ body }) => body?.includes('MessageBody'))
      .map(({ body }) => {
        const event = JSON.parse(JSON.parse(body).MessageBody)
        // vary per run, so cannot be asserted on
        delete event.correlationId
        delete event.when
        return event
      })
  }

  const waitForEvents = async (attemptsLeft: number): Promise<SentAuditEvent[]> => {
    const events = await readSentEvents()
    if (events.length >= expectedCount || attemptsLeft <= 0) {
      return events
    }
    await new Promise(resolve => {
      setTimeout(resolve, 50)
    })
    return waitForEvents(attemptsLeft - 1)
  }

  return waitForEvents(100)
}

export const resetStubs = (): Promise<Response[]> =>
  Promise.all([superagent.delete(`${url}/mappings`), superagent.delete(`${url}/requests`)])

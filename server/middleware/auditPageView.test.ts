import express from 'express'
import request from 'supertest'

import { AuditService } from '@ministryofjustice/hmpps-audit-client'

import auditPageView from './auditPageView'

jest.mock('@ministryofjustice/hmpps-audit-client')

let auditService: jest.Mocked<AuditService>

const renderedHtml = '<html lang="en">page</html>'

/**
 * Minimal app mirroring app.ts' ordering: user first, then the audit middleware, then routes.
 *
 * `res.render` is stubbed *before* the audit middleware so that the middleware wraps the stub,
 * exactly as it wraps the real nunjucks renderer in the running app.
 */
function appWithAuditing({
  username = 'user1',
  renderFails = false,
}: { username?: string | null; renderFails?: boolean } = {}): express.Express {
  const app = express()

  app.use((req, res, next) => {
    req.id = 'request123'
    res.locals.user = username ? ({ username } as Express.Locals['user']) : undefined
    res.render = ((_view: string, _options?: object, callback?: (err: Error, html: string) => void) => {
      const error = renderFails ? new Error('render failed') : null
      if (callback) {
        callback(error, renderedHtml)
      } else if (error) {
        next(error)
      } else {
        res.send(renderedHtml)
      }
    }) as typeof res.render
    next()
  })

  app.get('*any', auditPageView(auditService))

  app.get('/', (req, res) => res.render('pages/establishmentList'))
  app.get('/prisoner/:prisonerNumber', (req, res) => res.render('pages/prisonerProperty'))
  app.get('/prisoner/:prisonerNumber/history', (req, res) => res.render('pages/propertyHistory'))
  app.get('/prisoner/:prisonerNumber/image', (req, res) => res.send('image'))
  app.get('/admin/prisons', (req, res) => res.render('pages/admin/prisons'))

  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).send('error')
  })

  return app
}

/** audit events logged, in the order the audit service saw them */
function loggedEvents() {
  return auditService.logAuditEvent.mock.calls.map(([event]) => ({
    subject: { subjectType: event.subjectType, subjectId: event.subjectId },
    what: event.action,
  }))
}

const forPrisoner = { subjectType: 'PRISONER_ID', subjectId: 'A1234BC' }

beforeEach(() => {
  auditService = new AuditService(null) as jest.Mocked<AuditService>
  auditService.logAuditEvent.mockResolvedValue(undefined)
})

describe('auditPageView', () => {
  it('logs a page view and an access attempt when a page renders', async () => {
    await request(appWithAuditing()).get('/prisoner/A1234BC').expect(200).expect(renderedHtml)

    expect(loggedEvents()).toEqual([
      { subject: forPrisoner, what: 'PAGE_VIEW' },
      { subject: forPrisoner, what: 'PAGE_VIEW_ACCESS_ATTEMPT' },
    ])
  })

  it('passes the username, correlation id and page url to the audit service', async () => {
    await request(appWithAuditing()).get('/prisoner/A1234BC/history').expect(200)

    expect(auditService.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        who: 'user1',
        correlationId: 'request123',
        details: { pageUrl: '/prisoner/A1234BC/history' },
      }),
      expect.anything(),
    )
  })

  it('picks up the prisoner number from the path, whatever the case', async () => {
    await request(appWithAuditing()).get('/prisoner/a1234bc').expect(200)

    expect(loggedEvents()[0].subject).toEqual({ subjectType: 'PRISONER_ID', subjectId: 'a1234bc' })
  })

  it('picks up the search term from the establishment list query string', async () => {
    await request(appWithAuditing()).get('/?q=Jones').expect(200)

    expect(loggedEvents()[0].subject).toEqual({ subjectType: 'SEARCH_TERM', subjectId: 'Jones' })
  })

  it('truncates an over-long search term, which HMPPS Audit would reject', async () => {
    await request(appWithAuditing())
      .get(`/?q=${'x'.repeat(200)}`)
      .expect(200)

    expect(loggedEvents()[0].subject.subjectId).toHaveLength(80)
  })

  it('has neither prisoner nor search term for a page about neither', async () => {
    await request(appWithAuditing()).get('/admin/prisons').expect(200)

    expect(loggedEvents()[0].subject).toEqual({ subjectType: 'NOT_APPLICABLE', subjectId: undefined })
  })

  it('logs only an attempt when a request does not render a page', async () => {
    await request(appWithAuditing()).get('/prisoner/A1234BC/missing').expect(404)

    expect(loggedEvents()).toEqual([{ subject: forPrisoner, what: 'PAGE_VIEW_ACCESS_ATTEMPT' }])
  })

  it('does not audit the prisoner photo, which is embedded in the banner and in search results', async () => {
    await request(appWithAuditing()).get('/prisoner/A1234BC/image').expect(200)

    expect(auditService.logAuditEvent).not.toHaveBeenCalled()
  })

  it('does not audit when there is no signed-in user', async () => {
    await request(appWithAuditing({ username: null }))
      .get('/prisoner/A1234BC')
      .expect(200)

    expect(auditService.logAuditEvent).not.toHaveBeenCalled()
  })

  it('still serves the page when auditing fails', async () => {
    auditService.logAuditEvent.mockRejectedValue(new Error('SQS is down'))

    await request(appWithAuditing()).get('/prisoner/A1234BC').expect(200).expect(renderedHtml)
  })

  it('passes render errors to the error handler rather than swallowing them', async () => {
    await request(appWithAuditing({ renderFails: true }))
      .get('/prisoner/A1234BC')
      .expect(500)
  })
})

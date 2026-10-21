import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import setUpCurrentUser from './setUpCurrentUser'

const createToken = (claims: Record<string, unknown>) => jwt.sign(claims, 'secret', { expiresIn: '1h' })

const run = (token: string) =>
  new Promise<Response>((resolve, reject) => {
    const req = { method: 'GET', url: '/' } as Request
    const res = { locals: { user: { token, authSource: 'auth' } } } as unknown as Response
    const next: NextFunction = err => (err ? reject(err) : resolve(res))
    setUpCurrentUser()(req, res, next)
  })

describe('setUpCurrentUser', () => {
  it('populates userUuid from the user_uuid claim', async () => {
    const userUuid = '5b6c4f2e-1a3d-4e8b-9c7f-0d2e1a3b4c5d'

    const res = await run(createToken({ name: 'JOHN SMITH', user_id: '123', user_uuid: userUuid }))

    expect(res.locals.user.userUuid).toEqual(userUuid)
  })

  it('leaves userUuid undefined when the claim is missing', async () => {
    const res = await run(createToken({ name: 'JOHN SMITH', user_id: '123' }))

    expect(res.locals.user.userUuid).toBeUndefined()
  })
})

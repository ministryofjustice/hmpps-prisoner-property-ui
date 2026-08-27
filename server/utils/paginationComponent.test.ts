import path from 'path'
import nunjucks, { Environment } from 'nunjucks'
import { formatNumber } from './utils'
import { buildPagination } from './propertyList'

/**
 * The pagination component is a local fork of the MoJ Frontend one, so its results line is ours to
 * get right - and ours to re-check whenever @ministryofjustice/frontend is upgraded.
 */
describe('pagination component', () => {
  let env: Environment

  beforeAll(() => {
    env = nunjucks.configure(
      [
        path.join(__dirname, '../views'),
        'node_modules/govuk-frontend/dist/',
        'node_modules/@ministryofjustice/frontend/',
      ],
      { autoescape: true },
    )
    env.addFilter('formatNumber', formatNumber)
  })

  const resultsLine = (pagination: unknown): string | undefined => {
    const template = '{% from "components/pagination/macro.njk" import mojPagination %}{{ mojPagination(p) }}'
    const html = nunjucks.compile(template, env).render({ p: pagination })
    return /moj-pagination__results">([^<]*)</.exec(html)?.[1]?.trim()
  }

  it('drops "total" and separates thousands', () => {
    expect(resultsLine(buildPagination(1, 94, 4665, 50, ''))).toBe('Showing 1 to 50 of 4,665 results')
  })

  it('uses the singular noun for a single result', () => {
    expect(resultsLine(buildPagination(1, 1, 1, 50, ''))).toBe('Showing 1 to 1 of 1 result')
  })

  it('uses the plural noun for more than one result', () => {
    expect(resultsLine(buildPagination(1, 1, 11, 50, ''))).toBe('Showing 1 to 11 of 11 results')
  })

  it('says nothing when there are no results', () => {
    expect(resultsLine(buildPagination(1, 0, 0, 50, ''))).toBeUndefined()
  })

  it('drops "total" from the count-only line as well', () => {
    // Reached when the caller supplies a count but no pagination items or range.
    expect(resultsLine({ results: { count: 1200, text: 'results' } })).toBe('1,200 results')
  })
})

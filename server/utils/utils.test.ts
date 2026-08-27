import { convertToTitleCase, formatDate, formatNumber, formatShortDate, initialiseName } from './utils'

describe('convert to title case', () => {
  it.each([
    [null, null, ''],
    ['empty string', '', ''],
    ['Lower case', 'robert', 'Robert'],
    ['Upper case', 'ROBERT', 'Robert'],
    ['Mixed case', 'RoBErT', 'Robert'],
    ['Multiple words', 'RobeRT SMiTH', 'Robert Smith'],
    ['Leading spaces', '  RobeRT', '  Robert'],
    ['Trailing spaces', 'RobeRT  ', 'Robert  '],
    ['Hyphenated', 'Robert-John SmiTH-jONes-WILSON', 'Robert-John Smith-Jones-Wilson'],
  ])('%s convertToTitleCase(%s, %s)', (_: string | null, a: string | null, expected: string) => {
    expect(convertToTitleCase(a)).toEqual(expected)
  })
})

describe('format short date', () => {
  it.each([
    ['null', null, ''],
    ['empty string', '', ''],
    ['invalid', 'not-a-date', ''],
    ['ISO datetime', '2026-06-01T10:00:00', '1/6/2026'],
    ['ISO date', '2025-12-11', '11/12/2025'],
    ['single digit day and month', '2026-01-03', '3/1/2026'],
    ['single digit month only', '2015-01-12', '12/1/2015'],
  ])('%s formatShortDate(%s) = %s', (_: string, value: string | null, expected: string) => {
    expect(formatShortDate(value)).toEqual(expected)
  })
})

describe('format date', () => {
  it.each([
    ['null', null, ''],
    ['invalid', 'not-a-date', ''],
    ['ISO date', '1977-06-29', '29 June 1977'],
  ])('%s formatDate(%s) = %s', (_: string, value: string | null, expected: string) => {
    expect(formatDate(value)).toEqual(expected)
  })
})

describe('format number', () => {
  it.each([
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['empty string', '', ''],
    ['not a number', 'abc', ''],
    ['zero', 0, '0'],
    ['under a thousand', 999, '999'],
    ['four digits', 4665, '4,665'],
    ['five digits', 10068, '10,068'],
    ['numeric string', '9180', '9,180'],
  ])('%s formatNumber(%s) = %s', (_: string, value: number | string | null | undefined, expected: string) => {
    expect(formatNumber(value)).toEqual(expected)
  })
})

describe('initialise name', () => {
  it.each([
    [null, null, null],
    ['Empty string', '', null],
    ['One word', 'robert', 'r. robert'],
    ['Two words', 'Robert James', 'R. James'],
    ['Three words', 'Robert James Smith', 'R. Smith'],
    ['Double barrelled', 'Robert-John Smith-Jones-Wilson', 'R. Smith-Jones-Wilson'],
  ])('%s initialiseName(%s, %s)', (_: string | null, a: string | null, expected: string | null) => {
    expect(initialiseName(a)).toEqual(expected)
  })
})

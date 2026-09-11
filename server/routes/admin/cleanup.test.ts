import { DEFAULT_OLDER_THAN_DAYS, parseOlderThanDays } from './cleanup'

describe('parseOlderThanDays', () => {
  it('defaults when absent or blank', () => {
    expect(parseOlderThanDays(undefined)).toEqual({ value: DEFAULT_OLDER_THAN_DAYS })
    expect(parseOlderThanDays('')).toEqual({ value: DEFAULT_OLDER_THAN_DAYS })
    expect(parseOlderThanDays('  ')).toEqual({ value: DEFAULT_OLDER_THAN_DAYS })
  })

  it('accepts a whole number of days in range', () => {
    expect(parseOlderThanDays('1')).toEqual({ value: 1 })
    expect(parseOlderThanDays(' 90 ')).toEqual({ value: 90 })
    expect(parseOlderThanDays('3650')).toEqual({ value: 3650 })
  })

  it('rejects anything else with a message, keeping the default as the value', () => {
    for (const raw of ['0', '-1', '3651', '1.5', 'lots', '28days', ['28', '29']]) {
      expect(parseOlderThanDays(raw)).toEqual({
        value: DEFAULT_OLDER_THAN_DAYS,
        error: 'Enter a whole number of days between 1 and 3650',
      })
    }
  })
})

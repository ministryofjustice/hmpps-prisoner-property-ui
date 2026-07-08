import { disposalBanner } from './changeContainer'

describe('disposalBanner', () => {
  it('returns null when there is no disposal date', () => {
    expect(disposalBanner(null)).toBeNull()
    expect(disposalBanner(undefined)).toBeNull()
    expect(disposalBanner('')).toBeNull()
  })

  it('flags a past disposal date as overdue', () => {
    expect(disposalBanner('2020-01-01')).toEqual({ overdue: true, date: '2020-01-01' })
  })

  it('flags a future disposal date as due (not overdue)', () => {
    expect(disposalBanner('2999-01-01')).toEqual({ overdue: false, date: '2999-01-01' })
  })

  it("treats today's date as due, not overdue", () => {
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(disposalBanner(iso)).toEqual({ overdue: false, date: iso })
  })
})

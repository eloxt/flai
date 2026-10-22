import { afterEach, describe, expect, it, vi } from 'vitest'
import { run, value } from './run'

afterEach(() => vi.useRealTimers())

const cases: Record<string, [string, unknown][]> = {
  FormatDate: [
    ['@FormatDate("2026-10-09")', 'Oct 9, 2026'],
    ['@FormatDate("2026-10-09", "short")', 'Oct 9'],
    ['@FormatDate("2026-10-09", "long")', 'Friday, October 9, 2026'],
    ['@FormatDate("2026-10-09", "weekday")', 'Fri'],
    ['@FormatDate("2026-10-09", "month")', 'Oct 2026'],
    ['@FormatDate("2026-10-09", "iso")', '2026-10-09'],
    ['@FormatDate("2026-10-09T21:30:00Z", "time")', '9:30 PM'],
    ['@FormatDate("2026-10-09T21:30:00Z", "datetime")', 'Oct 9, 9:30 PM'],
    ['@FormatDate(0, "iso")', '1970-01-01'],
    ['@FormatDate("2026-02-30")', null],
    ['@FormatDate("soon")', null],
  ],
  AddDays: [
    ['@AddDays("2026-10-09", 3)', '2026-10-12'],
    ['@AddDays("2026-12-30", 5)', '2027-01-04'],
    ['@AddDays("2026-03-01", -1)', '2026-02-28'],
    ['@AddDays("2026-10-09T23:00:00Z", 1)', '2026-10-10'],
    ['@AddDays("bad", 1)', null],
  ],
  DaysBetween: [
    ['@DaysBetween("2026-10-09", "2026-12-25")', 77],
    ['@DaysBetween("2026-12-25", "2026-10-09")', -77],
    ['@DaysBetween("2026-10-09", "2026-10-09")', 0],
    ['@DaysBetween("2026-10-09", null)', null],
  ],
  AddMonths: [
    ['@AddMonths("2026-01-31", 1)', '2026-02-28'],
    ['@AddMonths("2026-10-09", -12)', '2025-10-09'],
    ['@AddMonths("2026-11-15", 3)', '2027-02-15'],
  ],
  MonthsBetween: [
    ['@MonthsBetween("1990-05-20", "2026-05-19")', 431],
    ['@MonthsBetween("1990-05-20", "2026-05-20")', 432],
    ['@MonthsBetween("2026-03-15", "2026-01-20")', -1],
  ],
  StartOf: [
    ['@StartOf("2026-10-09", "week")', '2026-10-05'],
    ['@StartOf("2026-10-05", "week")', '2026-10-05'],
    ['@StartOf("2026-10-11", "week")', '2026-10-05'],
    ['@StartOf("2026-10-09", "month")', '2026-10-01'],
    ['@StartOf("2026-10-09", "year")', '2026-01-01'],
  ],
}

describe.each(Object.entries(cases))('@%s', (_name, list) => {
  it.each(list)('%s', (expr, expected) => expect(value(expr)).toEqual(expected))
})

describe('@Now', () => {
  it('returns the current instant as ISO', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    expect(value('@Now()')).toBe('2026-10-09T12:00:00.000Z')
    expect(value('@FormatDate(@AddDays(@Now(), 1), "short")')).toBe('Oct 10')
  })
})

describe('@Today', () => {
  it("returns the viewer's calendar day", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 9, 23, 30))
    expect(value('@Today()')).toBe('2026-10-09')
  })
})

describe('an invalid optional argument', () => {
  it('is dropped with an error, so its default applies', () => {
    const style = run('@FormatDate("2026-10-09", "fancy")')
    expect(style.value).toBe('Oct 9, 2026')
    expect(style.parseErrors.join()).toMatch(/one of/)
  })
})

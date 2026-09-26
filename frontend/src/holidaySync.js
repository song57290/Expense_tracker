import { Capacitor } from '@capacitor/core'
import { CapacitorCalendar, CalendarPermissionScope } from '@ebarooni/capacitor-calendar'

// "대한민국의 휴일"(구글 기본 동기화 캘린더 이름), "공휴일" 등 다양한 표기를 모두 잡는다
// — 푸룹(Life OS) 앱의 판별 방식과 동일, 날짜를 직접 관리하지 않고 기기에 이미
// 동기화된 캘린더로 판단하므로 매년 갱신할 필요가 없다.
const HOLIDAY_CALENDAR_PATTERN = /휴일|holiday/i

let holidayCalendarIdsCache = null

function fmtDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function ensurePermission() {
  const check = await CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR })
  if (check.result === 'granted') return true
  const req = await CapacitorCalendar.requestReadOnlyCalendarAccess()
  return req.result === 'granted'
}

async function getHolidayCalendarIds() {
  if (holidayCalendarIdsCache) return holidayCalendarIdsCache
  const { result: calendars } = await CapacitorCalendar.listCalendars()
  holidayCalendarIdsCache = new Set(
    calendars.filter(c => HOLIDAY_CALENDAR_PATTERN.test(c.title || '')).map(c => c.id)
  )
  return holidayCalendarIdsCache
}

// 매년 날짜가 고정인 공휴일(월, 일, 이름) — 음력 명절 제외
const FIXED_HOLIDAYS = [
  [1, 1, '신정'],
  [3, 1, '삼일절'],
  [5, 5, '어린이날'],
  [6, 6, '현충일'],
  [8, 15, '광복절'],
  [10, 3, '개천절'],
  [10, 9, '한글날'],
  [12, 25, '성탄절'],
]

// 음력 명절(설날·추석·부처님오신날)과 대체공휴일은 해마다 날짜가 달라 연도별로 직접
// 등록해야 한다 — 웹(브라우저)은 기기 캘린더에 접근할 수 없어 이 표를 쓰고, 네이티브
// 앱은 기기에 동기화된 공휴일 캘린더 일정 이름을 그대로 쓰므로 이 표가 굳이 최신이
// 아니어도 무방하다. 새해가 되면 해당 연도 항목을 추가해줘야 한다.
const LUNAR_HOLIDAYS_BY_YEAR = {
  2026: [
    ['2026-02-16', '설날 연휴'],
    ['2026-02-17', '설날'],
    ['2026-02-18', '설날 연휴'],
    ['2026-03-02', '대체공휴일'],
    ['2026-05-24', '부처님오신날'],
    ['2026-05-25', '대체공휴일'],
    ['2026-08-17', '대체공휴일'],
    ['2026-09-24', '추석 연휴'],
    ['2026-09-25', '추석'],
    ['2026-09-26', '추석 연휴'],
    ['2026-10-05', '대체공휴일'],
  ],
}

function getFallbackHolidayDates(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00`)
  const to = new Date(`${toDateStr}T00:00:00`)
  const dates = new Map()

  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    FIXED_HOLIDAYS.forEach(([m, d, name]) => {
      const date = new Date(y, m - 1, d)
      if (date >= from && date <= to) dates.set(fmtDateStr(date), name)
    })
    ;(LUNAR_HOLIDAYS_BY_YEAR[y] || []).forEach(([dateStr, name]) => {
      const date = new Date(`${dateStr}T00:00:00`)
      if (date >= from && date <= to) dates.set(dateStr, name)
    })
  }
  return dates
}

// 캘린더 탭에 빨간 글씨로 표시할 공휴일 날짜 → 이름 맵을 돌려준다.
// 네이티브 앱은 기기에 동기화된 공휴일 캘린더 일정을 읽고(이름도 그 일정 제목을 그대로 씀),
// 웹은 하드코딩된 표로 대체한다. 추석·설날처럼 여러 날에 걸친 일정은 그 기간의 모든
// 날짜에 포함시킨다(같은 일정에 속한 날짜는 같은 이름을 공유).
export async function getHolidayDates(fromDateStr, toDateStr) {
  if (!Capacitor.isNativePlatform()) return getFallbackHolidayDates(fromDateStr, toDateStr)
  try {
    const granted = await ensurePermission()
    if (!granted) return new Map()
    const holidayIds = await getHolidayCalendarIds()
    if (holidayIds.size === 0) return new Map()

    const from = new Date(`${fromDateStr}T00:00:00`).getTime()
    const to = new Date(`${toDateStr}T23:59:59`).getTime()
    const { result: events } = await CapacitorCalendar.listEventsInRange({ from, to })

    const dates = new Map()
    events.filter(e => holidayIds.has(e.calendarId)).forEach(e => {
      const start = new Date(e.startDate)
      const endRaw = new Date(e.endDate)
      // 종일 일정의 종료일은 보통 "다음날 자정"으로 저장되는 배타적(exclusive) 값이라 하루 뺀다
      const end = e.isAllDay ? new Date(endRaw.getTime() - 86400000) : endRaw
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      while (cursor <= last) {
        dates.set(fmtDateStr(cursor), e.title)
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    return dates
  } catch (e) {
    console.error('[Holiday] fetch failed:', e)
    return new Map()
  }
}

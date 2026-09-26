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

// 캘린더 탭에 빨간 글씨로 표시할 공휴일 날짜 집합을 돌려준다(웹이거나 권한 미허용 시 빈 Set).
// 추석·설날처럼 여러 날에 걸친 일정은 그 기간의 모든 날짜에 포함시킨다.
export async function getHolidayDates(fromDateStr, toDateStr) {
  if (!Capacitor.isNativePlatform()) return new Set()
  try {
    const granted = await ensurePermission()
    if (!granted) return new Set()
    const holidayIds = await getHolidayCalendarIds()
    if (holidayIds.size === 0) return new Set()

    const from = new Date(`${fromDateStr}T00:00:00`).getTime()
    const to = new Date(`${toDateStr}T23:59:59`).getTime()
    const { result: events } = await CapacitorCalendar.listEventsInRange({ from, to })

    const dates = new Set()
    events.filter(e => holidayIds.has(e.calendarId)).forEach(e => {
      const start = new Date(e.startDate)
      const endRaw = new Date(e.endDate)
      // 종일 일정의 종료일은 보통 "다음날 자정"으로 저장되는 배타적(exclusive) 값이라 하루 뺀다
      const end = e.isAllDay ? new Date(endRaw.getTime() - 86400000) : endRaw
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      while (cursor <= last) {
        dates.add(fmtDateStr(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    return dates
  } catch (e) {
    console.error('[Holiday] fetch failed:', e)
    return new Set()
  }
}

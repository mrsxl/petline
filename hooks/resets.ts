// When a usage window resets: the time left, for the row, and the time it falls, for its hover card

const pad = (n: number) => String(n).padStart(2, '0')

// Time until a reset as hh:mm, with the days before it when there are any: 02:14, 3天04:00. Relative, so it
// reads the same in any time zone
export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const clock = `${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`
  return days > 0 ? `${days}天${clock}` : clock
}

// Midnight of a moment's day, on this machine's clock
function dayOf(t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// When a reset falls, on this machine's clock: 今天 15:30, 明天 08:00, 10月30日 16:00
export function resetTime(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at) || at <= now) return undefined
  const d = new Date(at)
  // Rounded, so a day that a daylight-saving change makes 23 or 25 hours long still counts one
  const daysAhead = Math.round((dayOf(at) - dayOf(now)) / 86_400_000)
  const day = daysAhead === 0 ? '今天' : daysAhead === 1 ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日`
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

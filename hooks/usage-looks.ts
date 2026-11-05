// The usage windows as the band draws them: one of several looks, each an SVG drawn as an image in the system
// font, in light colors that a dark appearance swaps (see ink.ts)

import { baseline, DARK_COLOR, fixed, HUE, INK, svgOf, text, textWidth } from './ink'
import type { UsageLookId } from '../types'

export { DARK_COLOR, textWidth }

// Usage % -> threshold (<70 ok, 70-89 warn, >=90 critical), as the script does
export type Level = 'ok' | 'warn' | 'critical'

export function levelFor(percent: number): Level {
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warn'
  return 'ok'
}

// What a window shows: its percent; the time until it resets, when there is room for it; and how much of the
// window's time has gone (0-1), when it says when it resets
export type WindowReading = { kind: string; label: string; percent: number; until?: string; elapsed?: number }

// One drawing and the windows it shows: a look draws a window each, or both in one
export type UsageDrawing = { kinds: string[]; svg: string; width: number; height: number; alt: string }

export const LEVEL_COLOR: Record<Level, string> = { ok: HUE.green, warn: HUE.amber, critical: HUE.red }

// Each window's own hue, for the rings drawn one inside the other
export const WINDOW_HUE: Record<string, string> = { five_hour: HUE.mint, seven_day: HUE.blue }

const colorOf = (percent: number) => LEVEL_COLOR[levelFor(percent)]

// A small % sign set right after the number it follows
const sign = (size: number, fill: string) => `<tspan font-size="${size}" font-weight="500" fill="${fill}" dx="1">%</tspan>`

function drawing(kinds: string[], width: number, height: number, body: string, alt: string): UsageDrawing {
  const w = Math.ceil(width)
  return {
    kinds,
    width: w,
    height,
    alt,
    svg: svgOf(w, height, body),
  }
}

// What a drawing says to a reader that cannot see it: `5h usage 42%，02:14 后重置`
export function windowAlt(w: WindowReading): string {
  return `${w.label} usage ${w.percent}%${w.until === undefined ? '' : `，${w.until} 后重置`}`
}

// A rounded track with the share filled in the level's color, at least a dot's worth when anything is used
function bar(x: number, y: number, width: number, height: number, percent: number, color: string): string {
  const share = Math.min(Math.max(percent, 0), 100) / 100
  const filled = share > 0 ? Math.max(height, width * share) : 0
  return (
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${width}" height="${height}" rx="${height / 2}" fill="${INK.track}" fill-opacity="${INK.trackOpacity}"/>` +
    (filled > 0 ? `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(filled)}" height="${height}" rx="${height / 2}" fill="${color}"/>` : '')
  )
}

// A ring's track in its color, faint, and its share clockwise from 12 o'clock
function ring(cx: number, cy: number, r: number, stroke: number, percent: number, color: string): string {
  const circumference = 2 * Math.PI * r
  const arc = (Math.min(Math.max(percent, 0), 100) / 100) * circumference
  const circle = `cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${stroke}"`
  return (
    `<circle ${circle} stroke="${color}" stroke-opacity="0.2"/>` +
    (arc > 0
      ? `<circle ${circle} stroke="${color}" stroke-linecap="round" stroke-dasharray="${fixed(arc)} ${fixed(circumference)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : '')
  )
}

// 双行仪表: label and time left over a bar that marks how much of the window's time has gone (a bar past the mark
// uses faster than time passes), the percent large beside them
const GAUGE = { height: 30, barWidth: 76, digits: 17 }

function gauge(w: WindowReading): UsageDrawing {
  const { height, barWidth, digits } = GAUGE
  let body = text(0, 10.5, w.label, 10, INK.secondary, 600)
  if (w.until !== undefined) body += text(barWidth, 10.5, w.until, 10, INK.secondary, 500, 'end')
  body += bar(0, 17, barWidth, 4, w.percent, colorOf(w.percent))
  if (w.elapsed !== undefined) {
    const x = fixed(barWidth * Math.min(Math.max(w.elapsed, 0), 1))
    body += `<rect x="${fixed(x - 0.75)}" y="14.5" width="1.5" height="9" rx="0.75" fill="${INK.primary}" fill-opacity="0.75"/>`
  }
  const n = String(w.percent)
  const x = barWidth + 9
  body += text(x, baseline(15, digits), `${n}${sign(10, INK.secondary)}`, digits, INK.primary, 600)
  return drawing([w.kind], x + textWidth(n, digits, true) + textWidth('%', 10) + 2, height, body, windowAlt(w))
}

// 同心双环: both windows in one drawing, the 7-day ring around the 5-hour one, each in its own hue, a line of legend
// for each beside them; a percent turns the level's color once it is high
const RINGS = { height: 32, center: 16, stroke: 3.2, radius: { five_hour: 8.6, seven_day: 13.6 } as Record<string, number> }

function rings(ws: readonly WindowReading[]): UsageDrawing {
  const { height, center, stroke, radius } = RINGS
  let body = ''
  for (const w of ws) body += ring(center, center, radius[w.kind] ?? radius.seven_day!, stroke, w.percent, WINDOW_HUE[w.kind] ?? INK.secondary)
  // One line centered, or two a line apart
  const rows = ws.length === 1 ? [center] : [9.5, 23]
  let width = 0
  ws.forEach((w, i) => {
    const y = rows[i] ?? center
    let x = 38
    body += `<circle cx="${x + 2.5}" cy="${y}" r="2.5" fill="${WINDOW_HUE[w.kind] ?? INK.secondary}"/>`
    x += 9
    body += text(x, baseline(y, 11), w.label, 11, INK.secondary, 600)
    x += textWidth(w.label, 11, true) + 5
    const percent = `${w.percent}%`
    body += text(x, baseline(y, 11.5), percent, 11.5, levelFor(w.percent) === 'ok' ? INK.primary : colorOf(w.percent), 600)
    x += textWidth(percent, 11.5, true)
    if (w.until !== undefined) {
      x += 5
      body += text(x, baseline(y, 11), w.until, 11, INK.secondary)
      x += textWidth(w.until, 11)
    }
    width = Math.max(width, x + 1)
  })
  return drawing(
    ws.map(w => w.kind),
    width,
    height,
    body,
    ws.map(windowAlt).join('；'),
  )
}

// 大字排版: the percent leads in large type in the level's color, label and time left small beside it, a hairline
// of the share beneath
const TYPE = { height: 30, digits: 18, small: 10.5 }

function type(w: WindowReading): UsageDrawing {
  const { height, digits, small } = TYPE
  const n = String(w.percent)
  let body = text(0, 19, `${n}${sign(10, INK.secondary)}`, digits, colorOf(w.percent), 600)
  const x = textWidth(n, digits, true) + textWidth('%', 10) + 6
  body += text(x, 10.5, w.label, small, INK.secondary, 700)
  let right = x + textWidth(w.label, small, true)
  if (w.until !== undefined) {
    body += text(x, 21, w.until, small, INK.secondary)
    right = Math.max(right, x + textWidth(w.until, small))
  }
  const width = Math.ceil(right + 1)
  body += bar(0, 26, width, 2, w.percent, colorOf(w.percent))
  return drawing([w.kind], width, height, body, windowAlt(w))
}

type Look = { label: string; draw: (windows: readonly WindowReading[]) => UsageDrawing[] }

export const USAGE_LOOKS: Record<UsageLookId, Look> = {
  gauge: { label: '双行仪表', draw: ws => ws.map(gauge) },
  rings: { label: '同心双环', draw: ws => (ws.length === 0 ? [] : [rings(ws)]) },
  type: { label: '大字排版', draw: ws => ws.map(type) },
}

export const USAGE_LOOK_IDS = Object.keys(USAGE_LOOKS) as UsageLookId[]
export const DEFAULT_USAGE_LOOK: UsageLookId = 'gauge'

export function isUsageLook(value: unknown): value is UsageLookId {
  return typeof value === 'string' && value in USAGE_LOOKS
}

export function drawUsage(look: UsageLookId, windows: readonly WindowReading[]): UsageDrawing[] {
  return USAGE_LOOKS[look].draw(windows)
}

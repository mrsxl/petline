import { expect, test } from 'claude-code/testing'

import { GROUND_Y } from '../hooks/figures'
import { HUE, INK } from '../hooks/ink'
import { drawStatus, STATUS_HEIGHT, STATUS_WIDTH, statusAlt } from '../hooks/status'
import type { Measured } from '../hooks/speed'
import type { SpeedPhase } from '../types'

const base = { tps: 0 }

test('the status says what the session is doing, and how long a tool has run or an approval waited', () => {
  expect(statusAlt({ ...base, phase: 'responding' })).toBe('输出中')
  expect(statusAlt({ ...base, phase: 'thinking' })).toBe('思考中')
  expect(statusAlt({ ...base, phase: 'tool', tool: 'Bash', others: 2, seconds: 75 })).toBe('Bash +2 1m 15s')
  expect(statusAlt({ ...base, phase: 'permission', tool: 'Edit', seconds: 3 })).toBe('等你确认 Edit 3s')
  expect(statusAlt({ ...base, phase: 'idle' })).toBe('空闲')
  // In full, however long: the drawing is what has to fit
  expect(statusAlt({ ...base, phase: 'tool', tool: 'WebSearchAndFetch', seconds: 2 })).toBe('WebSearchAndFetch 2s')
})

test('each state draws its line icon in its own color before its words, set flush right at one width', () => {
  const colors: Record<SpeedPhase, string> = {
    responding: HUE.green,
    thinking: HUE.violet,
    tool: HUE.amber,
    permission: HUE.red,
    idle: INK.secondary,
  }
  for (const [phase, color] of Object.entries(colors) as [SpeedPhase, string][]) {
    const svg = drawStatus({ ...base, phase, tool: 'Bash', seconds: 4 }, false)
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}"`)).toBe(true)
    expect(svg).not.toMatch(/<image|<script|<foreignObject/)
    expect(svg).toContain(`stroke="${color}"`)
    // The last words end at the right edge, beside the usage
    expect(svg).toContain(`<text x="${STATUS_WIDTH}"`)
    expect(svg).toContain('text-anchor="end"')
    expect(svg).toContain('@media (prefers-color-scheme: dark)')
  }
})

// Where the icon starts, and the words drawn
const iconAt = (svg: string) => Number(/<g transform="translate\(([-\d.]+) /.exec(svg)?.[1])
const drawnWords = (svg: string) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(match => match[1])

test('a status too long for its width cuts the tool\'s name, its others going first, and never the time', () => {
  const longest: Measured = { ...base, phase: 'permission', tool: 'WebSearchAndFetch', others: 3, seconds: 3725 }
  const svg = drawStatus(longest, false)
  expect(iconAt(svg)).toBeGreaterThanOrEqual(0)
  const [time, main] = drawnWords(svg)
  expect(time).toBe('1h 02m')
  expect(main).toMatch(/^等你确认 W[a-zA-Z]*…$/)
  // A shorter wait leaves the name more room
  const [, shorter] = drawnWords(drawStatus({ ...longest, seconds: 5 }, false))
  expect(shorter!.length).toBeGreaterThan(main!.length)
  // One that fits says it all
  expect(drawnWords(drawStatus({ ...base, phase: 'tool', tool: 'Bash', others: 2, seconds: 75 }, false))).toEqual(['1m 15s', 'Bash +2'])
  // However long it runs, the icon stays in
  for (const seconds of [5, 600, 3725, 99_999]) {
    expect(iconAt(drawStatus({ ...longest, seconds }, false))).toBeGreaterThanOrEqual(0)
  }
})

test('while the cat is up its ground runs on into the status, up to just short of the icon; else none', () => {
  const thinking: Measured = { ...base, phase: 'thinking' }
  const carried = drawStatus(thinking, true)
  const ground = /<rect x="0" y="([\d.]+)" width="([\d.]+)" height="1"/.exec(carried)
  // On the lane's own line, as tall as the lane, so the two meet
  expect(Number(ground?.[1])).toBe(GROUND_Y)
  expect(STATUS_HEIGHT).toBe(32)
  expect(Math.abs(Number(ground?.[2]) - (iconAt(carried) - 6))).toBeLessThan(0.01)
  expect(drawStatus(thinking, false)).not.toContain(`<rect x="0" y="${GROUND_Y}"`)
  // A status that fills its width leaves no room to carry it on into
  expect(drawStatus({ ...base, phase: 'permission', tool: 'WebSearchAndFetch', others: 3, seconds: 3725 }, true)).not.toContain(`<rect x="0" y="${GROUND_Y}"`)
})

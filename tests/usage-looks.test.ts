import { expect, test } from 'claude-code/testing'

import { DARK_COLOR, drawUsage, LEVEL_COLOR, textWidth, USAGE_LOOK_IDS, WINDOW_HUE } from '../hooks/usage-looks'
import type { WindowReading } from '../hooks/usage-looks'

// What a drawing paints with, its style for a dark appearance left out
const painted = (svg: string | undefined) => (svg ?? '').replace(/<style>.*?<\/style>/, '')

const FIVE: WindowReading = { kind: 'five_hour', label: '5h', percent: 42, until: '02:14', elapsed: 0.55 }
const SEVEN: WindowReading = { kind: 'seven_day', label: '7d', percent: 91, until: '3天04:00', elapsed: 0.4 }

test('every look, with one window or both, is shapes and text alone, no taller than the figure', () => {
  for (const look of USAGE_LOOK_IDS) {
    {
      for (const windows of [[FIVE, SEVEN], [SEVEN], [{ ...FIVE, until: undefined, elapsed: undefined }]]) {
        const drawn = drawUsage(look, windows)
        expect(drawn.length).toBeGreaterThan(0)
        for (const d of drawn) {
          expect(d.svg).not.toMatch(/<image|<script|<foreignObject/)
          expect(d.svg).toContain(`width="${d.width}" height="${d.height}"`)
          expect(d.height).toBeLessThanOrEqual(32)
          for (const w of windows.filter(w => d.kinds.includes(w.kind))) expect(d.svg).toContain(String(w.percent))
        }
        // Every window is in exactly one drawing
        expect(drawn.flatMap(d => d.kinds)).toEqual(windows.map(w => w.kind))
      }
    }
  }
})

test('the time left shows only where there is room for it, and takes room when it does', () => {
  for (const look of USAGE_LOOK_IDS) {
    const [shown] = drawUsage(look, [FIVE])
    const [hidden] = drawUsage(look, [{ ...FIVE, until: undefined }])
    expect(shown?.svg).toContain('02:14')
    expect(hidden?.svg).not.toContain('02:14')
    expect(shown?.alt).toBe('5h usage 42%，02:14 后重置')
    expect(hidden?.alt).toBe('5h usage 42%')
    expect(hidden!.width).toBeLessThanOrEqual(shown!.width)
  }
})

test('the gauge fills its bar by the percent and marks how much of the window\'s time has gone', () => {
  const [gauge] = drawUsage('gauge', [FIVE])
  // A 76px bar: 42% of it filled, the mark at 55% of it
  expect(gauge?.svg).toContain(`width="31.92" height="4" rx="2" fill="${LEVEL_COLOR.ok}"`)
  expect(gauge?.svg).toContain('<rect x="41.05" y="14.5" width="1.5" height="9"')
  // No mark without a reset to measure from, no fill at 0%
  expect(drawUsage('gauge', [{ ...FIVE, elapsed: undefined }])[0]?.svg).not.toContain('y="14.5"')
  expect(painted(drawUsage('gauge', [{ ...FIVE, percent: 0 }])[0]?.svg)).not.toContain(LEVEL_COLOR.ok)
})

test('the rings draw both windows in one, each in its hue, a high percent in its level\'s color', () => {
  const drawn = drawUsage('rings', [FIVE, SEVEN])
  expect(drawn).toHaveLength(1)
  expect(drawn[0]?.kinds).toEqual(['five_hour', 'seven_day'])
  expect(drawn[0]?.alt).toBe('5h usage 42%，02:14 后重置；7d usage 91%，3天04:00 后重置')
  expect(drawn[0]?.svg).toContain(`stroke="${WINDOW_HUE.five_hour}"`)
  expect(drawn[0]?.svg).toContain(`stroke="${WINDOW_HUE.seven_day}"`)
  expect(drawn[0]?.svg).toMatch(new RegExp(`fill="${LEVEL_COLOR.critical}"[^>]*>91%<`))
  expect(painted(drawn[0]?.svg)).not.toContain(LEVEL_COLOR.ok)
})

test('the large type sets the percent in its level\'s color', () => {
  expect(drawUsage('type', [SEVEN])[0]?.svg).toMatch(new RegExp(`fill="${LEVEL_COLOR.critical}"[^>]*>91<tspan`))
  expect(drawUsage('type', [{ ...SEVEN, percent: 75 }])[0]?.svg).toMatch(new RegExp(`fill="${LEVEL_COLOR.warn}"[^>]*>75<tspan`))
})

test('text is measured wide enough: wide characters take a whole size, digits a little over half', () => {
  expect(Math.round(textWidth('3天04:00', 10) * 100)).toBe(Math.round(10 * (0.62 + 1 + 4 * 0.62 + 0.3) * 100))
  expect(textWidth('42', 17, true)).toBeGreaterThan(textWidth('42', 17))
})

test('every color a look draws in has its dark one, which a dark appearance swaps in', () => {
  for (const look of USAGE_LOOK_IDS) {
    for (const d of drawUsage(look, [FIVE, { ...SEVEN, percent: 75 }])) {
      expect(d.svg).toContain('@media (prefers-color-scheme: dark){')
      const colors = new Set([...painted(d.svg).matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map(m => m[1]!))
      // The track's black is made faint white by a rule of its own
      for (const color of colors) if (color !== '#000000') expect(DARK_COLOR[color]).toBeDefined()
      for (const color of colors) if (color !== '#000000') expect(d.svg).toContain(`[fill="${color}"]{fill:${DARK_COLOR[color]}}`)
    }
  }
  expect(drawUsage('gauge', [FIVE])[0]?.svg).toContain('[fill="#000000"]{fill:#ffffff;fill-opacity:0.13}')
})

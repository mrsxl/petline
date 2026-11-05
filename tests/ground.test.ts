import { expect, test } from 'claude-code/testing'

import { drawLane, GROUND_Y, HOME_CLEAR } from '../hooks/figures'
import { CAP, drawGround, GRASS, SPOT } from '../hooks/ground'
import { LINE_ART } from '../hooks/ink'

const WIDE = 600
const ground = (width: number) => drawGround(width, GROUND_Y, HOME_CLEAR)

// Where each tuft and mushroom stands in a lane `real` pixels wide: its frame's share of the lane, and its shift
const standing = (svg: string, real: number) =>
  [...svg.matchAll(/<svg x="([\d.]+)%" overflow="visible"><g transform="translate\(([-\d.]+) 0\)">/g)].map(
    ([, x, shift]) => (Number(x) / 100) * real + Number(shift),
  )

test('the ground is a line across the whole lane where the cat\'s feet meet it, however wide the lane turns out', () => {
  expect(ground(WIDE).startsWith(`<rect x="0" y="${GROUND_Y}" width="100%" height="1" fill="${LINE_ART.line}"/>`)).toBe(true)
})

test('the same lane draws the same ground, so a redraw changes nothing; another width another one', () => {
  expect(ground(WIDE)).toBe(ground(WIDE))
  expect(ground(WIDE + 1)).not.toBe(ground(WIDE))
})

test('green grass and red mushrooms with light spots, outlined in the line art\'s ink, the left end left bare', () => {
  const svg = ground(WIDE)
  expect(svg).toContain(`stroke="${GRASS}"`)
  expect(svg).toContain(`fill="${CAP}" stroke="${LINE_ART.line}"`)
  expect(svg).toContain(`fill="${SPOT}"`)
  // Where the cat stretches out nothing grows, and nothing stands past the right end, at the width the plugin
  // reckons the lane at or at a real one a good deal wider
  for (const real of [WIDE, WIDE * 1.3]) {
    const xs = standing(svg, real)
    expect(xs.length).toBeGreaterThan(5)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(HOME_CLEAR)
    expect(Math.max(...xs)).toBeLessThanOrEqual(real - 5)
  }
})

test('a mushroom patch to about every 220 pixels, none where the lane is too short for one', () => {
  const caps = (svg: string) => svg.split(`fill="${CAP}"`).length - 1
  expect(caps(ground(HOME_CLEAR + 60))).toBe(0)
  const wide = caps(ground(HOME_CLEAR + 880))
  // Four patches, a smaller mushroom beside some
  expect(wide).toBeGreaterThanOrEqual(4)
  expect(wide).toBeLessThanOrEqual(8)
})

test('the ground lies behind the cat, and its hues swap for their dark ones but the spots stay light', () => {
  const lane = drawLane({ pose: 'run', rate: 1.1, begin: 0, travel: 0 }, WIDE)
  expect(lane.indexOf('width="100%"')).toBeLessThan(lane.indexOf('<svg x="-'))
  for (const color of [GRASS, CAP, LINE_ART.line]) expect(lane).toContain(`[stroke="${color}"]{stroke:`)
  expect(lane).toContain(`[fill="${CAP}"]{fill:`)
  expect(lane).not.toContain(`[fill="${SPOT}"]`)
})

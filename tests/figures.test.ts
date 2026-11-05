import { expect, test } from 'claude-code/testing'

import {
  drawLane,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  FrameBuffer,
  Gait,
  GROUND_Y,
  HOME_RATE,
  placeIn,
  RESTING,
  SET_OFF_MS,
  WALK_RATES,
  WALK_SPEED,
  walkRate,
} from '../hooks/figures'
import { LINE_ART, LINE_ART_DARK } from '../hooks/ink'
import { MOVE_STYLE } from '../hooks/lane'
import { SCENES } from '../hooks/scenes'
import type { FigureInputs } from '../types'

// A lane that leaves the cat 400 pixels to walk
const LANE = 400 + FIGURE_WIDTH
const ROOM = LANE - FIGURE_WIDTH
const HALF = FIGURE_WIDTH / 2

const WALK = SCENES['cat-walking'].seconds
const SET_OFF = SET_OFF_MS / 1000
const at = (seconds: number) => seconds * 1000
const thousandths = (n: number) => Number(n.toFixed(3))

const walking = (rate: number, travel = 0, begin = SET_OFF): FigureInputs => ({ pose: 'run', rate, begin, travel })
const homeward = (from: number): FigureInputs => ({ pose: 'rest', rate: HOME_RATE, begin: SET_OFF, travel: from })

// How far into their loop the legs stand when a walk sets off, as a share of the loop
const legsAt = ({ rate, begin }: FigureInputs) => ((((SET_OFF - begin) * rate) / WALK) % 1 + 1) % 1

// How far apart two shares of a loop are, either way round
const apart = (a: number, b: number) => Math.min(Math.abs(a - b) % 1, 1 - (Math.abs(a - b) % 1))

// A share of the way along the lane, as a drawing moves the cat's middle there: `p` of a frame stretched to 1000
// across the lane's real width, then, scaled back, the pixels left, half the cat in at the left and as far short of
// the right
const across = (shares: readonly number[]) => shares.map(p => `${thousandths(p * 1000)} 0`).join(';')
const rest = (shares: readonly number[]) => shares.map(p => `${thousandths(HALF * (1 - p) - p * HALF)} 0`).join(';')

test('the lane, whatever the cat does, is paths, SMIL and a static CSS scale alone, within the band\'s limit', () => {
  for (const cat of [RESTING, walking(1.4, 120), homeward(200)]) {
    const svg = drawLane(cat, LANE)
    expect(svg).not.toMatch(/<image|<script|\{L\}|\{F\}|__DUR__|@keyframes|animation:/)
    // The swap for a dark appearance, and where the cat moves, the stretch its motion is drawn across
    expect(svg.match(/<style/g)).toHaveLength(cat === RESTING ? 1 : 2)
    expect(svg.includes(MOVE_STYLE)).toBe(cat !== RESTING)
    expect(svg.length).toBeLessThan(131_072)
    // No viewBox: the frame lays it out in pixels, however wide the band makes it
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${LANE}" height="${FIGURE_HEIGHT}">`)).toBe(true)
  }
  // Never narrower than the cat
  expect(drawLane(RESTING, 10)).toContain(`width="${FIGURE_WIDTH}" height="${FIGURE_HEIGHT}"`)
})

test('the cat walks the lane to the right end and back, again and again, facing the way it goes', () => {
  expect(placeIn(400, 0)).toEqual({ x: 0, facing: 1 })
  expect(placeIn(400, 150)).toEqual({ x: 150, facing: 1 })
  expect(placeIn(400, 450)).toEqual({ x: 350, facing: -1 })
  expect(placeIn(400, 900)).toEqual({ x: 100, facing: 1 })
  // A lane no wider than the cat: it walks on the spot
  expect(placeIn(0, 300)).toEqual({ x: 0, facing: 1 })
})

test('a walk goes round the lane at its rate from where the cat stands, setting off a tick after it loads', () => {
  const svg = drawLane(walking(1.4, 450, 0.25), LANE)
  // The legs' loop at its rate, begun as asked
  expect(svg).toContain(`dur="${thousandths(WALK / 1.4)}s" begin="0.25s"`)
  // One round trip of the lane by shares of its real width, by SMIL, whose clock runs from the load (a CSS
  // animation's would wait for the frame to come into view): from 350 of 400 (0.875), facing left, to the left end,
  // the right, and back, at WALK_SPEED × rate over the lane's reckoned width, from a tick after it loads
  const shares = [0.875, 0, 1, 0.875]
  const timing = `keyTimes="0;0.438;0.938;1" dur="${thousandths((2 * ROOM) / (WALK_SPEED * 1.4))}s" begin="${SET_OFF}s" repeatCount="indefinite"`
  expect(svg).toContain(`<g transform="translate(875 0)"><animateTransform attributeName="transform" type="translate" values="${across(shares)}" ${timing}/>`)
  expect(svg).toContain(`<g transform="translate(-12.75 0)"><animateTransform attributeName="transform" type="translate" values="${rest(shares)}" ${timing}/>`)
  // Turning at each end
  expect(svg).toContain('<g transform="scale(-1 1)"><animateTransform attributeName="transform" type="scale" values="-1 1;1 1;-1 1" keyTimes="0;0.438;0.938" calcMode="discrete"')
})

test('idle, the cat hurries home from where it stopped and stretches out there, the ground going with it', () => {
  const svg = drawLane(homeward(200), LANE)
  const home = thousandths(SET_OFF + 200 / (WALK_SPEED * HOME_RATE))
  // Facing left, from 200 of 400 to the left end at HOME_RATE, setting off a tick after it loads
  const timing = `dur="${thousandths(home - SET_OFF)}s" begin="${SET_OFF}s" fill="freeze"`
  expect(svg).toContain(`values="${across([0.5, 0])}" ${timing}/>`)
  expect(svg).toContain(`values="${rest([0.5, 0])}" ${timing}/>`)
  expect(svg).toContain('<g transform="scale(-1 1)">')
  // There the walking cat gives way to the resting one by opacity: the walk shows and hides its own layers by
  // visibility, which would show through a group hidden by it, two cats at once; and the ground goes
  const gone = `<set attributeName="opacity" to="0" begin="${home}s"/>`
  expect(svg.split(gone)).toHaveLength(3)
  expect(svg).toContain(` opacity="0"><set attributeName="opacity" to="1" begin="${home}s"/>`)
  expect(svg).not.toMatch(/attributeName="visibility" to=|<g transform="translate\([^)]*\)" visibility=/)
  // Home already, it only stretches out
  expect(drawLane(homeward(0), LANE)).toBe(drawLane(RESTING, LANE))
})

test('at rest the lane is the cat alone: no ground, nothing moving', () => {
  const svg = drawLane(RESTING, LANE)
  expect(svg).not.toContain('<rect')
  // Its own scene breathes, but nothing moves it along the lane
  expect(svg).not.toContain('class="stretch"')
  expect(svg).toContain(`<g transform="translate(${HALF} 0)">`)
})

test('the walk speeds up in four steps of tokens per second', () => {
  expect(WALK_RATES).toEqual([0.8, 1.1, 1.4, 1.8])
  expect([0, 24, 25, 59, 60, 99, 100, 500].map(walkRate)).toEqual([0.8, 0.8, 1.1, 1.1, 1.4, 1.4, 1.8, 1.8])
})

test('both poses share one frame and stand on the lane\'s ground, so the cat never jumps between them', () => {
  const inner = (svg: string) =>
    [...svg.matchAll(/<svg x="[^"]*" y="0" width="[^"]*" height="[^"]*" viewBox="([^"]+)"/g)].map(m => m[1]!.split(' ').map(Number))
  const boxes = [...inner(drawLane(RESTING, LANE)), ...inner(drawLane(walking(1.1), LANE))]
  expect(new Set(boxes.map(([, , w, h]) => `${w}x${h}`)).size).toBe(1)
  // Where each scene drew the ground it walked on lies GROUND_Y pixels down, the top of the lane's own ground
  const grounds = [SCENES['relaxing-cat'], SCENES['cat-walking']].map(s => s.ground)
  boxes.forEach(([, y, , h], k) => expect(Math.abs(((grounds[k]! - y!) / h!) * FIGURE_HEIGHT - GROUND_Y)).toBeLessThan(0.1))
  expect(drawLane(walking(1.1), LANE)).toContain(`<rect x="0" y="${GROUND_Y}" width="100%" height="1"`)
})

test('black lines and white fills, swapped for light lines and dark fills in a dark appearance', () => {
  for (const cat of [RESTING, walking(0.8), homeward(120)]) {
    const svg = drawLane(cat, LANE)
    expect(svg).toContain(`stroke="${LINE_ART.line}"`)
    expect(svg).toContain('@media (prefers-color-scheme: dark){')
    expect(svg).toContain(`[stroke="${LINE_ART.line}"]{stroke:${LINE_ART_DARK[LINE_ART.line]}}`)
    expect(svg).toContain(`[fill="${LINE_ART.fill}"]{fill:#262626}`)
  }
})

test('the gait wakes at the left end, holds a rate three ticks, and picks a new one up where the cat and its legs have got to', () => {
  const gait = new Gait()
  expect(gait.next(false, 0, at(0), ROOM)).toBe(RESTING)
  // Waking, it sets off from the left end a tick later, at the rate its speed asks
  const first = gait.next(true, 30, at(1), ROOM)
  expect(first).toMatchObject({ pose: 'run', rate: 1.1, travel: 0 })
  // A faster speed waits until the walk has held three ticks
  expect(gait.next(true, 120, at(2), ROOM)).toBe(first)
  expect(gait.next(true, 120, at(3), ROOM)).toBe(first)
  const faster = gait.next(true, 120, at(4), ROOM)
  // Shown a tick from now, three seconds after the first walk set off: it has come 3 s × 1.1 × WALK_SPEED
  expect(faster).toMatchObject({ pose: 'run', rate: 1.8, travel: Number((3 * 1.1 * WALK_SPEED).toFixed(1)) })
  // Its legs stand where the first walk's have got to by then
  expect(apart(legsAt(faster), legsAt(first) + (3 * 1.1) / WALK)).toBeLessThan(0.002)
  // A speed that stays in its step changes nothing, so the band keeps the frame it has
  expect(gait.next(true, 150, at(5), ROOM)).toBe(faster)
})

test('idle, the cat turns where it has got to and hurries home; woken on the way, it sets off rightward from there', () => {
  const gait = new Gait()
  gait.next(true, 30, at(0), ROOM)
  // Idle at 10 s, shown at 11 s: ten seconds at 1.1 since the walk set off is 209 pixels along
  const home = gait.next(false, 0, at(10), ROOM)
  expect(home).toMatchObject({ pose: 'rest', rate: HOME_RATE, travel: 209 })
  expect(gait.next(false, 0, at(11), ROOM)).toBe(home)
  // Woken at 12 s, shown at 13 s: two seconds on its way home at HOME_RATE
  expect(gait.next(true, 30, at(12), ROOM)).toMatchObject({ pose: 'run', rate: 1.1, travel: Number((209 - 2 * HOME_RATE * WALK_SPEED).toFixed(1)) })
  // Past the right end, it is on its way back: idle there, it heads home from where it stands
  const far = new Gait()
  far.next(true, 30, at(0), ROOM)
  expect(far.next(false, 0, at(30), ROOM)).toMatchObject({ travel: placeIn(ROOM, 30 * 1.1 * WALK_SPEED).x })
  // Home long since, it wakes at the left end
  far.next(false, 0, at(31), ROOM)
  expect(far.next(true, 30, at(60), ROOM)).toMatchObject({ travel: 0 })
})

test('the cat is up while it walks, and hurrying home until it gets there; at rest, not', () => {
  const gait = new Gait()
  expect(gait.upAt(at(0), ROOM)).toBe(false)
  gait.next(true, 30, at(0), ROOM)
  expect(gait.upAt(at(5), ROOM)).toBe(true)
  // Idle at 10 s, shown and setting off home at 11 s from 209: there 209 / (HOME_RATE × WALK_SPEED) seconds on
  gait.next(false, 0, at(10), ROOM)
  const arrives = 11 + 209 / (HOME_RATE * WALK_SPEED)
  expect(gait.upAt(at(10), ROOM)).toBe(true)
  expect(gait.upAt(at(arrives - 0.1), ROOM)).toBe(true)
  expect(gait.upAt(at(arrives + 0.1), ROOM)).toBe(false)
})

test('a speed that lasts a single tick never changes the walk', () => {
  const gait = new Gait()
  const walk = gait.next(true, 30, at(0), ROOM)
  for (const [t, tps] of [[1, 30], [2, 30], [3, 30], [4, 0], [5, 30], [6, 140], [7, 30]] as const) {
    expect(gait.next(true, tps, at(t), ROOM)).toBe(walk)
  }
  // Two ticks in a row, once the walk has held its three, do
  expect(gait.next(true, 140, at(8), ROOM)).toBe(walk)
  expect(gait.next(true, 140, at(9), ROOM).rate).toBe(1.8)
})

test('a new drawing loads in the frame not shown, and is shown a tick later', () => {
  const frames = new FrameBuffer()
  const walk = walking(1.1)
  // Resting in front; nothing to load
  expect(frames.next(RESTING)).toEqual({ drawings: [RESTING, RESTING], front: 0 })
  // The walk goes to the back frame, the rest still shown
  expect(frames.next(walk)).toEqual({ drawings: [RESTING, walk], front: 0 })
  // A tick later it comes in; the rest stays, out of view, until it is needed again
  expect(frames.next(walk)).toEqual({ drawings: [RESTING, walk], front: 1 })
  expect(frames.next(walk)).toEqual({ drawings: [RESTING, walk], front: 1 })
  // Heading home is a drawing of its own, loaded the same way
  expect(frames.next(homeward(80))).toEqual({ drawings: [homeward(80), walk], front: 1 })
  expect(frames.next(homeward(80))).toEqual({ drawings: [homeward(80), walk], front: 0 })
})

test('a drawing that changes while the last one loads takes its place, the shown frame untouched', () => {
  const frames = new FrameBuffer()
  frames.next(RESTING)
  expect(frames.next(walking(0.8))).toEqual({ drawings: [RESTING, walking(0.8)], front: 0 })
  // It comes in; the next one, only further along, loads in the frame that held the rest
  expect(frames.next(walking(0.8, 30))).toEqual({ drawings: [walking(0.8, 30), walking(0.8)], front: 1 })
  expect(frames.next(walking(0.8, 30))).toEqual({ drawings: [walking(0.8, 30), walking(0.8)], front: 0 })
})

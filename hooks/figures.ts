// The cat in the band: the line cat, drawn from two animations on LottieFiles rebuilt by tools/lottie_svg.py as SVGs
// that play by SMIL (the band takes no script and no embedded image). While the session works it walks the lane, the
// room the row leaves free, left to right and back again, faster as the output streams faster; once the session is
// idle it hurries home to the lane's left end and stretches out there; all on a ground of grass and mushrooms. The
// lane is one drawing, mounted as an interactive frame, so a redraw of the band doesn't restart it.

import { CAP, drawGround, GRASS } from './ground'
import { DARK_COLOR, fixed, LINE_ART, LINE_ART_DARK } from './ink'
import { MOVE_STYLE, moving } from './lane'
import type { Run } from './lane'
import { SCENES } from './scenes'
import type { Scene } from './scenes'
import { darkScheme } from './scheme'
import type { FigureInputs, Frames, Pose } from '../types'

export type { Pose }

// Each pose's animation
const SCENE: Record<Pose, keyof typeof SCENES> = { run: 'cat-walking', rest: 'relaxing-cat' }

// One walk at four rates, by tokens per second: under 25, from 25, from 60, from 100
export const WALK_RATES = [0.8, 1.1, 1.4, 1.8] as const
const RATE_STEPS = [25, 60, 100] as const

export function walkRate(tps: number): number {
  return WALK_RATES[RATE_STEPS.filter(step => tps >= step).length]!
}

// The cat's size in CSS pixels: as tall as a little over a line, as wide as the scenes need, no wider than 64. Both
// scenes share one scale, centered across, and stand where they meet their ground on one line, GROUND_Y pixels down,
// the lane's ground; so a change of pose neither moves nor resizes the cat
export const FIGURE_HEIGHT = 32

// Room under the ground's top: feet sink into it a little, and the line has a width of its own
const GROUND_DEPTH = 2
export const GROUND_Y = FIGURE_HEIGHT - GROUND_DEPTH

const POSED: readonly Scene[] = Object.values(SCENE).map(name => SCENES[name])

// Where a scene's figure meets its ground, in its own units: the bottom of its frame where it drew none
const groundOf = ({ ground, viewBox: [, y, , h] }: Scene) => ground ?? y + h

// How far the tallest figure reaches above its ground, drawn in GROUND_Y pixels
const ABOVE = Math.max(...POSED.map(scene => groundOf(scene) - scene.viewBox[1]))
const SCALE = GROUND_Y / ABOVE
export const FIGURE_WIDTH = Math.min(64, Math.ceil(Math.max(...POSED.map(scene => scene.viewBox[2])) * SCALE))
const FRAME_W = FIGURE_WIDTH / SCALE
const FRAME_H = FIGURE_HEIGHT / SCALE

function frameOf(scene: Scene): string {
  const [x, , w] = scene.viewBox
  return [x + w / 2 - FRAME_W / 2, groundOf(scene) - ABOVE, FRAME_W, FRAME_H].map(v => Math.round(v)).join(' ')
}

// Each color the lane draws in swapped for its dark one in a dark appearance: the line art's, and the ground's hues
const DARK = darkScheme({ [GRASS]: DARK_COLOR[GRASS]!, [CAP]: DARK_COLOR[CAP]!, ...LINE_ART_DARK })

// Where the ground leaves the lane bare: the left end, where the cat stretches out
export const HOME_CLEAR = FIGURE_WIDTH + 6

// How fast the cat crosses the lane at a rate of 1, in CSS pixels a second: a walk this small barely moves its
// feet, so the pace is the eye's, about 30 seconds across a lane of 550
export const WALK_SPEED = 19

// The rate it hurries home at, once the session is idle: three times its walk, so it is soon stretched out
export const HOME_RATE = 3

// Where the cat is along the lane after walking `travel` pixels: from the left end to the right and back, again and
// again, facing the way it goes. `room` is how far it can go, the lane less the cat's own width
export function placeIn(room: number, travel: number): { x: number; facing: 1 | -1 } {
  if (room <= 0) return { x: 0, facing: 1 }
  const along = ((travel % (2 * room)) + 2 * room) % (2 * room)
  return along < room ? { x: along, facing: 1 } : { x: 2 * room - along, facing: -1 }
}

// The last few drawings: the band asks for the one it shows on every redraw
const cache = new Map<string, string>()
const CACHE_SIZE = 8

// Times and places to the thousandth: a whole drawing at one precision, so the same inputs draw the same string
const exact = (n: number) => fixed(n, 3)

// A new drawing is shown a tick after it is drawn (see FrameBuffer), so a walk is drawn as it will be then: standing
// where the cat will have got to, setting off a tick after it loads. Its clock (SMIL's) runs from the load, though
// its frame is out of view until then, so it comes in where the last one left off.
export const SET_OFF_MS = 1000

// The trip from a share `p` of the way along, facing `facing`, to the far end and back: the shares it passes
// through over one round trip, when, and which way it faces from each
function trip(p: number, facing: 1 | -1) {
  // Right from p to the right end, back to the left end, and right again to p; or the mirror of it
  const shares = facing === 1 ? [p, 1, 0, p] : [p, 0, 1, p]
  const times = facing === 1 ? [0, (1 - p) / 2, (2 - p) / 2, 1] : [0, p / 2, (p + 1) / 2, 1]
  const faces = facing === 1 ? [1, -1, 1, 1] : [-1, 1, -1, -1]
  return { shares, times: times.map(exact), faces }
}

// One of the cat's scenes, its loop at `rate` started at `begin` seconds, centered on the origin and standing on
// the lane's floor, for a group to place and turn
function catOf(pose: Pose, rate: number, begin: number): string {
  const scene = SCENES[SCENE[pose]]
  const timing = `dur="${exact(scene.seconds / rate)}s"` + (begin !== 0 ? ` begin="${exact(begin)}s"` : '')
  return (
    `<svg x="${-FIGURE_WIDTH / 2}" y="0" width="${FIGURE_WIDTH}" height="${FIGURE_HEIGHT}" viewBox="${frameOf(scene)}">` +
    scene.body.replaceAll('dur="__DUR__"', timing).replaceAll('{L}', LINE_ART.line).replaceAll('{F}', LINE_ART.fill) +
    `</svg>`
  )
}

// The cat's middle walks from half its width in at the left end to as far short of the right: its whole self in
const CAT_RUN: Run = { from: FIGURE_WIDTH / 2, to: FIGURE_WIDTH / 2 }

// The cat at the lane's left end, facing right, with any attributes and animations of the group's own
const atHome = (cat: string, attrs = '', animations = '') => `<g transform="translate(${FIGURE_WIDTH / 2} 0)"${attrs}>${animations}${cat}</g>`

// The lane's SVG, about `lane` pixels wide, from the gait's inputs: the cat walking its ground; or, idle, hurrying
// home to the left end from where it stopped and stretching out there, the ground going as it lies down. It fits the
// lane's frame however wide that turns out (see lane.ts): `lane` only paces the walk and spaces the ground. The same
// string for the same drawing, so the band keeps the frame it has
export function drawLane({ pose, rate, begin, travel }: FigureInputs, lane: number): string {
  const width = Math.max(Math.round(lane), FIGURE_WIDTH)
  const key = `${pose}:${rate}:${begin}:${travel}:${width}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const room = width - FIGURE_WIDTH
  const setOff = SET_OFF_MS / 1000
  const ground = drawGround(width, GROUND_Y, HOME_CLEAR)
  let body: string
  let style = ''
  if (pose === 'run' && room > 0) {
    const { x, facing } = placeIn(room, travel)
    const { shares, times, faces } = trip(x / room, facing)
    const timing = `dur="${exact((2 * room) / (WALK_SPEED * rate))}s" begin="${setOff}s" repeatCount="indefinite"`
    // Turning at each end, on the walk's own keyframes
    const turn = `<animateTransform attributeName="transform" type="scale" values="${faces.slice(0, 3).map(f => `${f} 1`).join(';')}" keyTimes="${times.slice(0, 3).join(';')}" calcMode="discrete" ${timing}/>`
    style = MOVE_STYLE
    body = ground + moving(`<g transform="scale(${facing} 1)">${turn}${catOf('run', rate, begin)}</g>`, CAT_RUN, shares, timing, times.join(';'))
  } else if (pose === 'run') {
    body = ground + atHome(catOf('run', rate, begin))
  } else {
    // `travel` is where it heads home from; home already, it only stretches out, on no ground. One cat gives way to
    // the other by opacity, and the ground goes with it: the scenes show and hide their own layers by visibility,
    // which would show through a group hidden by it
    const from = Math.min(travel, room)
    const resting = catOf('rest', 1, 0)
    if (from > 0) {
      const home = setOff + from / (WALK_SPEED * rate)
      const gone = `<set attributeName="opacity" to="0" begin="${exact(home)}s"/>`
      const timing = `dur="${exact(home - setOff)}s" begin="${setOff}s" fill="freeze"`
      style = MOVE_STYLE
      body =
        `<g>${gone}${ground}</g>` +
        `<g>${gone}${moving(`<g transform="scale(-1 1)">${catOf('run', rate, begin)}</g>`, CAT_RUN, [from / room, 0], timing)}</g>` +
        atHome(resting, ' opacity="0"', `<set attributeName="opacity" to="1" begin="${exact(home)}s"/>`)
    } else {
      body = atHome(resting)
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FIGURE_HEIGHT}">${DARK}${style}${body}</svg>`
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(key, svg)
  return svg
}

export const RESTING: FigureInputs = { pose: 'rest', rate: 1, begin: 0, travel: 0 }

// While the cat works its walk never starts over: a new rate picks up where the cat stands and where its legs have
// got to, the way a game eases a walk faster without a new animation. Each new rate is still a new drawing, so a rate
// comes only once its speed has lasted STEADY_TICKS, and stays at least HOLD_TICKS. Waking and going idle come at the
// next tick: idle, it turns and hurries home; waking, it sets off rightward from wherever it has got to.
const STEADY_TICKS = 2
const HOLD_TICKS = 3

const round1 = (n: number) => Math.round(n * 10) / 10

// The legs' loop at `rate`, started so that it stands at `phase` of its loop when the walk sets off
const legsFrom = (phase: number, rate: number) => exact(SET_OFF_MS / 1000 - (phase * SCENES[SCENE.run].seconds) / rate)

export class Gait {
  private shown: FigureInputs = RESTING
  // When the shown drawing sets off (ms), and how far into their loop the legs are then, as a share of the loop
  private since = 0
  private phase = 0
  private held = 0
  // The rate the speed asks for, and for how many ticks in a row
  private wanted = 0
  private steady = 0

  // The cat to draw, called once a tick with whether the session works, its tokens per second, the time, and the
  // room the lane leaves the cat to walk (its width less the cat's)
  next(working: boolean, tps: number, now: number, room: number): FigureInputs {
    // A new drawing is shown, and sets off, a tick from now
    const then = now + SET_OFF_MS
    if (!working) {
      if (this.shown.pose === 'run') {
        const from = round1(placeIn(room, this.travelAt(then)).x)
        const phase = this.phaseAt(then)
        this.settle(then, { pose: 'rest', rate: HOME_RATE, begin: legsFrom(phase, HOME_RATE), travel: from }, phase)
      }
      return this.shown
    }
    this.held++
    const rate = walkRate(tps)
    this.steady = rate === this.wanted ? this.steady + 1 : 1
    this.wanted = rate
    const settled = this.steady >= STEADY_TICKS && this.held >= HOLD_TICKS
    if (this.shown.pose === 'run' && (rate === this.shown.rate || !settled)) return this.shown
    const phase = this.phaseAt(then)
    // Waking, it sets off rightward from where it has got to on its way home
    const travel = this.shown.pose === 'run' ? this.travelAt(then) : this.homeAt(then)
    this.settle(then, { pose: 'run', rate, begin: legsFrom(phase, rate), travel }, phase)
    this.held = 0
    return this.shown
  }

  // Whether the cat is up at `now`, on its ground: walking, or hurrying home and not there yet. Asked of the gait
  // rather than the frame in view: a cat heading home sets off as its drawing comes in, so it is up until then too
  upAt(now: number, room: number): boolean {
    if (this.shown.pose === 'run') return true
    const from = Math.min(this.shown.travel, room)
    return from > 0 && now < this.since + (from / (WALK_SPEED * this.shown.rate)) * 1000
  }

  // Shows `next` from `then`, the legs standing at `phase` of their loop
  private settle(then: number, next: FigureInputs, phase: number) {
    this.phase = phase
    this.shown = next
    this.since = then
  }

  // How far the shown walk has come by `time`, at its pace since it set off
  private walked(time: number): number {
    return (Math.max(0, time - this.since) / 1000) * WALK_SPEED * this.shown.rate
  }

  // How far a working cat has walked the lane by `time`
  private travelAt(time: number): number {
    return round1(this.shown.travel + this.walked(time))
  }

  // Where a cat hurrying home is at `time`: where it set out from, less the way it has come, at the left end at last
  private homeAt(time: number): number {
    return round1(Math.max(0, this.shown.travel - this.walked(time)))
  }

  // How far into their loop the legs are at `time`
  private phaseAt(time: number): number {
    return (this.phase + (Math.max(0, time - this.since) / 1000) * (this.shown.rate / SCENES[SCENE.run].seconds)) % 1
  }
}

// A new drawing remounts the frame it is drawn in, which is blank while it loads. So the lane has two frames at one
// place, and a new drawing goes to the one not shown: it loads there unseen and comes in a tick later, already
// playing, the other going out. The band never shows a frame while it loads, whatever changes and however often.
export const STILL_FRAMES: Frames = { drawings: [RESTING, RESTING], front: 0 }

const same = (a: FigureInputs, b: FigureInputs) =>
  a.pose === b.pose && a.rate === b.rate && a.begin === b.begin && a.travel === b.travel

export class FrameBuffer {
  private readonly drawings: [FigureInputs, FigureInputs] = [RESTING, RESTING]
  private front: 0 | 1 = 0
  private loading = false

  // The frames to draw, called once a tick with the drawing the cat wants now
  next(want: FigureInputs): Frames {
    if (this.loading) {
      this.front = this.front === 0 ? 1 : 0
      this.loading = false
    }
    if (!same(want, this.drawings[this.front])) {
      this.drawings[this.front === 0 ? 1 : 0] = want
      this.loading = true
    }
    return { drawings: [this.drawings[0], this.drawings[1]], front: this.front }
  }
}

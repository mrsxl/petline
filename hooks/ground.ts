// The ground the cat walks on: a line across the lane where its feet meet it, tufts of grass and a few mushrooms
// along it, drawn behind the cat in its line. Their places are shares of the lane (see lane.ts), so the ground spans
// the lane's frame however wide it turns out; how many there are, and where, follows the lane's width as the plugin
// reckons it, so the same lane draws the same ground and a redraw changes nothing. The left end, where the cat
// stretches out, stays bare

import { fixed, HUE, LINE_ART } from './ink'
import { placed } from './lane'
import type { Run } from './lane'

// The ground line and every outline in the line art's ink, the grass green, the mushroom caps red; their spots a
// cream that stays light in either appearance, no dark style swapping it
export const GRASS = HUE.green
export const CAP = HUE.red
export const SPOT = '#fff8f0'

// The ground line's width, and the grass's and the mushrooms' outlines, in pixels: the cat's own lines are 0.84
const GROUND_LINE = 1
const LINE = 0.85

// A mushroom patch to about every PATCH pixels of the lane, its mushroom about a third as tall as the cat and a
// smaller one beside some; a tuft of grass every TUFT_MIN to TUFT_MIN + TUFT_SPREAD pixels
const PATCH = 220
const MUSHROOM = 1.3
const SMALL_MUSHROOM = 0.8
const TUFT_MIN = 22
const TUFT_SPREAD = 34

// A run of numbers in [0, 1) fixed by its seed (mulberry32): the same lane, the same ground
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const stroked = (d: string, color: string) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>`

// How far short of the lane's right end the grass and mushrooms stop
const EDGE = 5

// The ground line itself, its top `y` pixels down, `width` across: the lane's, and the status's carrying it on
export const groundLine = (y: number, width: number | string) =>
  `<rect x="0" y="${y}" width="${width}" height="${GROUND_LINE}" fill="${LINE_ART.line}"/>`

// A tuft of three blades rising from the ground at 0, `s` times its usual size
function tuft(base: number, s: number): string {
  const p = (dx: number, dy: number) => `${fixed(dx * s)} ${fixed(base - dy * s)}`
  return stroked(
    `M${p(-1.5, 0)}Q${p(-1.9, 2.2)} ${p(-3.1, 3.5)}M${p(0, 0)}Q${p(-0.3, 2.9)} ${p(0.4, 5.1)}M${p(1.4, 0)}Q${p(1.9, 2)} ${p(3, 3.2)}`,
    GRASS,
  )
}

// A mushroom standing on the ground at 0, `s` times its usual size: a stem, a domed cap and three spots on it
function mushroom(base: number, s: number): string {
  const p = (dx: number, dy: number) => `${fixed(dx * s)} ${fixed(base - dy * s)}`
  const outline = `stroke="${LINE_ART.line}" stroke-width="${LINE}" stroke-linejoin="round"`
  const stem = `<path d="M${p(-1.2, 0)}C${p(-1.4, 1.6)} ${p(-1.1, 3)} ${p(-0.9, 3.4)}L${p(0.9, 3.4)}C${p(1.1, 3)} ${p(1.4, 1.6)} ${p(1.2, 0)}Z" fill="${LINE_ART.fill}" ${outline}/>`
  const dome = `<path d="M${p(-3.7, 3.2)}C${p(-3.7, 7.9)} ${p(3.7, 7.9)} ${p(3.7, 3.2)}Z" fill="${CAP}" ${outline}/>`
  const spots = [[-1.6, 4.5, 0.6], [1.3, 5.2, 0.5], [-0.1, 6, 0.42]]
    .map(([dx, dy, r]) => `<circle cx="${fixed(dx! * s)}" cy="${fixed(base - dy! * s)}" r="${fixed(r! * s)}" fill="${SPOT}"/>`)
    .join('')
  return stem + dome + spots
}

// The ground for a lane about `width` pixels wide, its top `y` pixels down, bare for its first `clear` pixels
export function drawGround(width: number, y: number, clear: number): string {
  const random = seeded(width)
  const base = y + 0.2
  const span = width - clear
  // A patch of mushrooms somewhere in each share of the lane, a smaller one beside some
  const patches = span < 80 ? 0 : Math.max(1, Math.round(span / PATCH))
  const mushrooms: { x: number; s: number }[] = []
  for (let k = 0; k < patches; k++) {
    const x = clear + ((k + 0.25 + random() * 0.5) * span) / patches
    mushrooms.push({ x, s: MUSHROOM })
    if (random() < 0.6) mushrooms.push({ x: x + (random() < 0.5 ? -6 : 6), s: SMALL_MUSHROOM })
  }
  // Tufts of grass along the rest, clear of the mushrooms
  const tufts: { x: number; s: number }[] = []
  for (let x = clear + random() * TUFT_MIN; x < width - EDGE; x += TUFT_MIN + random() * TUFT_SPREAD) {
    const s = 0.85 + random() * 0.45
    if (mushrooms.every(m => Math.abs(m.x - x) > 9)) tufts.push({ x, s })
  }
  // Each at its share of the run from the bare end to the right one
  const run: Run = { from: clear, to: EDGE }
  const share = (x: number) => Math.min(1, Math.max(0, (x - clear) / (width - clear - EDGE)))
  return (
    groundLine(y, '100%') +
    tufts.map(t => placed(tuft(base, t.s), share(t.x), run)).join('') +
    mushrooms.map(m => placed(mushroom(base, m.s), share(m.x), run)).join('')
  )
}

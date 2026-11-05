// Placing things along the lane by a share of its width rather than by pixels. The band lays the row out in its own
// cells, whose width no plugin can measure, and the lane's frame stretches across whatever the row leaves; so the
// lane is drawn to fit any width. A share `p` of the way along a run from `from` pixels in at the left end to `to`
// pixels short of the right lies at `from + p·(L − from − to)` in a lane `L` wide, whatever `L` turns out to be.
//
// What stays put is a frame starting `p` of the lane across, its contents shifted by `from·(1−p) − p·to`. What moves
// does so by SMIL, whose clock runs from the moment its frame loads, out of view or not (a CSS animation's waits
// until its frame is in view, and then a moment more, which would put the cat behind where the next drawing has it).
// SMIL moves by pixels alone, so a move is drawn twice over: `p·L` as `p·1000` across a frame stretched to make 1000
// of the lane's width (a static CSS scale, `tan(atan2())` dividing one length by another), then, scaled back, the
// rest of it, `from·(1−p) − p·to`, in pixels; both on the same keyframes, so their sum moves as one.

import { fixed } from './ink'

export type Run = { from: number; to: number }

const exact = (n: number) => fixed(n, 3)

// `inner`, drawn with its reference point at 0, standing a share `p` of the way along `run`
export function placed(inner: string, p: number, { from, to }: Run): string {
  return `<svg x="${exact(p * 100)}%" overflow="visible"><g transform="translate(${exact(from * (1 - p) - p * to)} 0)">${inner}</g></svg>`
}

// How many units across the stretched frame makes of the lane's width
const ACROSS = 1000

// The style a drawing that moves things along the lane carries: the frame stretched, and scaled back
export const MOVE_STYLE =
  `<style>.stretch{transform:scale(tan(atan2(100vw,${ACROSS}px)),1)}` + `.unstretch{transform:scale(tan(atan2(${ACROSS}px,100vw)),1)}</style>`

// `inner`, drawn with its reference point at 0, moving along `run` through `shares` at `keyTimes` (evenly spread
// where absent), timed by `timing` (its dur, begin, and repeatCount or fill); `MOVE_STYLE` must be in the drawing.
// Until the motion begins it stands at the first of them
export function moving(inner: string, run: Run, shares: readonly number[], timing: string, keyTimes?: string): string {
  const keys = keyTimes === undefined ? '' : ` keyTimes="${keyTimes}"`
  // A group moving through `values`, standing at the first until it starts
  const mover = (values: readonly number[], body: string) =>
    `<g transform="translate(${exact(values[0]!)} 0)"><animateTransform attributeName="transform" type="translate" values="${values.map(v => `${exact(v)} 0`).join(';')}"${keys} ${timing}/>${body}</g>`
  const { from, to } = run
  const rest = mover(shares.map(p => from * (1 - p) - p * to), inner)
  return `<g class="stretch">${mover(shares.map(p => p * ACROSS), `<g class="unstretch">${rest}</g>`)}</g>`
}

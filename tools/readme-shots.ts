// The README's picture: the band in each state, light and dark, drawn by the plugin's own code and laid out as the
// Desktop app lays it out (the lane in a frame of its own, filling what the row leaves; the status and the usage as
// images), the usage in each of its looks in turn. Writes one page with a card of every state for each appearance,
// each lane held at a moment worth showing:
//
//   bun tools/readme-shots.ts tools/out/shots.html
//
// then serve the folder (the lanes' frames must be same-origin with the page), open the page at a device scale of 2
// and, once every lane's frame says it is held (`data-held`), screenshot `#states-light` and `#states-dark` by their
// rectangles into docs/images/.

import { drawLane, FIGURE_HEIGHT, FIGURE_WIDTH, RESTING } from '../hooks/figures'
import { drawStatus, STATUS_HEIGHT, STATUS_WIDTH } from '../hooks/status'
import type { Measured } from '../hooks/speed'
import { drawUsage } from '../hooks/usage-looks'
import type { WindowReading } from '../hooks/usage-looks'
import type { UsageLookId } from '../types'

const out = process.argv[2] ?? 'tools/out/shots.html'

// The band as wide as the app's often is, its padding, and the gap between the status and the usage's drawings
const BAND = 760
const PAD = 16
const GAP = 17

// Both windows: how much of each is used, the time left until it resets, and how much of its time has gone
const windows = (five: [number, string, number], seven: [number, string, number]): WindowReading[] => [
  { kind: 'five_hour', label: '5h', percent: five[0], until: five[1], elapsed: five[2] },
  { kind: 'seven_day', label: '7d', percent: seven[0], until: seven[1], elapsed: seven[2] },
]

// Each state the README shows: what the session is doing, the usage in which look, where the cat walks (a share of
// its lane, at a rate) or none where it rests, and the moment its drawing is held at. The usage climbs from one to
// the next, through its three levels' colors
type Shot = { status: Measured; look: UsageLookId; usage: WindowReading[]; walk?: { share: number; rate: number }; at: number }
const SHOTS: Shot[] = [
  { status: { phase: 'responding', tps: 90 }, look: 'gauge', usage: windows([28, '02:31', 0.5], [21, '3天11:21', 0.5]), walk: { share: 0.55, rate: 1.4 }, at: 1.3 },
  { status: { phase: 'thinking', tps: 0 }, look: 'rings', usage: windows([46, '02:05', 0.58], [35, '3天10:55', 0.51]), walk: { share: 0.25, rate: 0.8 }, at: 1.5 },
  { status: { phase: 'tool', tps: 0, tool: 'Bash', seconds: 12 }, look: 'type', usage: windows([72, '01:40', 0.67], [52, '3天10:30', 0.51]), walk: { share: 0.8, rate: 0.8 }, at: 1.2 },
  { status: { phase: 'permission', tps: 0, tool: 'Edit', seconds: 3 }, look: 'gauge', usage: windows([91, '01:12', 0.76], [64, '3天10:02', 0.52]), walk: { share: 1.4, rate: 0.8 }, at: 1.4 },
  { status: { phase: 'idle', tps: 0 }, look: 'rings', usage: windows([93, '00:58', 0.81], [66, '3天09:48', 0.52]), at: 0.9 },
]

// A drawing in a light or a dark appearance, whatever the page's: its dark style dropped, or applied unconditionally
const appearance = (svg: string, dark: boolean) =>
  dark ? svg.replace('@media (prefers-color-scheme: dark){', '@media all{') : svg.replace(/<style>@media \(prefers-color-scheme: dark\)\{.*?\}\}<\/style>/, '')

const image = (svg: string, width: number, height: number, dark: boolean) =>
  `<img src="data:image/svg+xml;utf8,${encodeURIComponent(appearance(svg, dark))}" width="${width}" height="${height}">`

// The lane's frame as the app draws it: its document's style, the frame as wide as Svg may ask and capped at its slot
const FRAME_STYLE = 'html,body{margin:0;height:100%;background:transparent;overflow:hidden}body>svg{display:block;width:100%;height:100%}'
// Each frame holds its own drawing at `at` seconds: paused there once loaded, and paused again whenever anything
// sets it going (a frame scrolled into view resumes its animations), saying on its frame element where it stands
const holdAt = (at: number) =>
  `<script>addEventListener('load', () => { const svg = document.querySelector('svg'); const hold = () => { if (!svg.animationsPaused() || svg.getCurrentTime() !== ${at}) { svg.pauseAnimations(); svg.setCurrentTime(${at}) } frameElement.dataset.held = svg.animationsPaused() + '@' + svg.getCurrentTime() }; hold(); setInterval(hold, 50) })</script>`
const lane = (svg: string, at: number, dark: boolean) =>
  `<div class="lane"><iframe srcdoc="${`<!doctype html><style>${FRAME_STYLE}</style>${appearance(svg, dark)}${holdAt(at)}`.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe></div>`

// One state's band: the lane, filling what the status and the usage leave, then them. The plugin reckons the lane's
// width the same way, and the drawing fits its frame whatever the real width
function band({ status, look, usage, walk, at }: Shot, dark: boolean): string {
  const drawn = drawUsage(look, usage)
  const lanePx = BAND - 2 * PAD - STATUS_WIDTH - drawn.reduce((sum, d) => sum + d.width + GAP, 0)
  const cat = walk === undefined ? RESTING : { pose: 'run' as const, rate: walk.rate, begin: 0, travel: Math.round(walk.share * (lanePx - FIGURE_WIDTH)) }
  return (
    `<div class="band">` +
    lane(drawLane(cat, lanePx), at, dark) +
    `<div class="right">${image(drawStatus(status, walk !== undefined), STATUS_WIDTH, STATUS_HEIGHT, dark)}` +
    drawn.map(d => image(d.svg, d.width, d.height, dark)).join('') +
    `</div></div>`
  )
}

// Every state's band in one card, one under the other
const states = (dark: boolean) =>
  `<div class="card ${dark ? 'dark' : 'light'}" id="states-${dark ? 'dark' : 'light'}">${SHOTS.map(shot => band(shot, dark)).join('')}</div>`

const page = `<!doctype html><meta charset="utf-8"><title>petline shots</title>
<style>
body { margin: 0; padding: 12px; background: #888; font: 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
.card { box-sizing: border-box; width: ${BAND}px; margin: 0 0 12px; border-radius: 14px; overflow: hidden; }
.band { display: flex; align-items: center; box-sizing: border-box; min-height: 52px; padding: 0 ${PAD}px; }
.band + .band { border-top: 1px solid var(--rule); }
/* No color-scheme on the cards: a frame whose scheme differs from its page's is painted opaque */
.light { background: #f4f4f4; color: #555; --rule: #e4e4e4; } .dark { background: #262626; color: #aaa; --rule: #333; }
.lane { position: relative; flex: 1 1 0; height: ${FIGURE_HEIGHT}px; }
.lane iframe { position: absolute; top: 0; left: 0; display: block; border: 0; width: 4096px; max-width: 100%; height: ${FIGURE_HEIGHT}px; }
.right { display: flex; align-items: center; gap: ${GAP}px; }
</style>
${[false, true].map(states).join('')}
`

await Bun.write(out, page)
console.log(`wrote ${out}: #states-light, #states-dark (${SHOTS.map(s => `${s.status.phase} ${s.look}`).join(', ')})`)

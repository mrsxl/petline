// What the session is doing, drawn beside the usage: a line icon in each state's color, drawn like the cat, then its
// words, and the tool and how long it has run where one runs. One width, set flush right, so the lane beside it
// never moves; the one place the states are worded. While the cat is up, the cat's ground runs on into it, up to the
// icon: the lane ends where the status begins, and the room its words leave would otherwise break the ground off

import { FIGURE_HEIGHT, GROUND_Y } from './figures'
import { groundLine } from './ground'
import { fixed, HUE, INK, svgOf, text, textWidth } from './ink'
import { formatSeconds } from './speed'
import type { Measured } from './speed'
import type { SpeedPhase } from '../types'

export const STATUS_WIDTH = 132

// As tall as the lane, so the ground carried on lies on the lane's own line
export const STATUS_HEIGHT = FIGURE_HEIGHT

// How far short of the icon the ground carried on stops
const GROUND_GAP = 6

// Each state's color and word
const STATE: Record<SpeedPhase, { color: string; word: string }> = {
  responding: { color: HUE.green, word: '输出中' },
  thinking: { color: HUE.violet, word: '思考中' },
  tool: { color: HUE.amber, word: '' },
  permission: { color: HUE.red, word: '等你确认' },
  idle: { color: INK.secondary, word: '空闲' },
}

const SIZE = 12
const cy = STATUS_HEIGHT / 2
const y = fixed(cy + SIZE * 0.35)

// The room the icon takes before the words, and the gap between the words and the time after them
const ICON_ROOM = 19
const TIME_GAP = 5

// How long a tool has run or an approval waited, where one has
const timeOf = (m: Measured) => (m.seconds === undefined ? undefined : formatSeconds(m.seconds))

// The status's main words, no wider than `room` pixels: a tool's name too long for it is cut, the count of the
// others beside it going first, and where even its first letter is too long, a permission's word alone
function mainOf(m: Measured, room: number): string {
  const { word } = STATE[m.phase]
  if (m.phase !== 'tool' && m.phase !== 'permission') return word
  const tool = m.tool ?? ''
  const say = (name: string, more = '') => `${word} ${name}${more}`.trim()
  const tries = [say(tool, m.others ? ` +${m.others}` : ''), say(tool)]
  for (let n = tool.length - 1; n >= 1; n--) tries.push(say(`${tool.slice(0, n)}…`))
  if (word !== '') tries.push(word)
  return tries.find(words => textWidth(words, SIZE, true) <= room) ?? tries.at(-1)!
}

// What the status says in full, for the drawing's alt
export const statusAlt = (m: Measured) => [mainOf(m, Infinity), timeOf(m)].filter(Boolean).join(' ')

// The words and time, set to end at `right` and fitted to the room the icon leaves; returns the markup and where
// they start
function words(m: Measured, right: number, mainInk: string): { markup: string; left: number } {
  const time = timeOf(m)
  let x = right
  let markup = ''
  if (time !== undefined) {
    markup += text(x, y, time, SIZE - 1, INK.secondary, 500, 'end')
    x -= textWidth(time, SIZE - 1) + TIME_GAP
  }
  const main = mainOf(m, x - ICON_ROOM)
  markup += text(x, y, main, SIZE, mainInk, 600, 'end')
  return { markup, left: x - textWidth(main, SIZE, true) }
}

// Each state's line icon, 14 pixels square, drawn from its top left corner
const ICON: Record<SpeedPhase, string> = {
  // A pen writing
  responding: '<path d="M2.5 11.5 L2.5 13.5 L4.5 13.5 L12 6 L10 4 Z M9 5 L11 7" fill="none"/>',
  // A thought bubble
  thinking: '<path d="M4 9.5 C1.5 9.5 1.5 5.5 4 5.5 C4 2.5 9 2 10 4.5 C13 4.5 13 9.5 10 9.5 Z" fill="none"/><circle cx="3.5" cy="12.5" r="1" fill="none"/>',
  // A terminal prompt
  tool: '<rect x="1.5" y="2.5" width="11" height="9" rx="2" fill="none"/><path d="M4 5.5 L6 7 L4 8.5 M7.5 9 L10 9" fill="none"/>',
  // A lock
  permission: '<rect x="2.5" y="6.5" width="9" height="6" rx="1.5" fill="none"/><path d="M4.5 6.5 V4.5 A2.5 2.5 0 0 1 9.5 4.5 V6.5" fill="none"/>',
  // A crescent moon
  idle: '<path d="M10.5 9.5 A5 5 0 1 1 6 2.5 A4 4 0 0 0 10.5 9.5 Z" fill="none"/>',
}

// The status: its icon in the state's color, then its words, ending at the right edge; and where `ground`, the cat's
// ground carried on from the left edge to just short of the icon
export function drawStatus(m: Measured, ground: boolean): string {
  const { markup, left } = words(m, STATUS_WIDTH, m.phase === 'idle' ? INK.secondary : INK.primary)
  const iconAt = left - ICON_ROOM
  const icon = `<g transform="translate(${fixed(iconAt)} ${cy - 7})" stroke="${STATE[m.phase].color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICON[m.phase]}</g>`
  const carried = ground && iconAt > GROUND_GAP ? groundLine(GROUND_Y, fixed(iconAt - GROUND_GAP)) : ''
  return svgOf(STATUS_WIDTH, STATUS_HEIGHT, carried + icon + markup)
}

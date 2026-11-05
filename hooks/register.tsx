import { atom, read, update } from 'claude-code'
import type { Color, Elements, EngineInterface, Register, RenderChildren, RenderElement, SessionRateLimit } from 'claude-code'

import { drawLane, FIGURE_HEIGHT, FIGURE_WIDTH, FrameBuffer, Gait } from './figures'
import { columnsPx, fitRow, pxColumns, rowColumns } from './layout'
import type { Fit } from './layout'
import { resetTime, untilReset } from './resets'
import { IDLE_SPEED, Meter } from './speed'
import { drawStatus, STATUS_HEIGHT, STATUS_WIDTH, statusAlt } from './status'
import { DEFAULT_USAGE_LOOK, drawUsage, levelFor, USAGE_LOOK_IDS, USAGE_LOOKS } from './usage-looks'
import type { Level, WindowReading } from './usage-looks'
import type { Speed, UsageLookId } from '../types'

// Each rate-limit window the band shows, left to right, by its length in hours; it is labelled by that length,
// in hours under a day and in days from one
const WINDOW_HOURS: Readonly<Record<string, number>> = { five_hour: 5, seven_day: 7 * 24 }
const labelOf = (hours: number) => (hours < 24 ? `${hours}h` : `${hours / 24}d`)

// Cells between the parts of a group, between the usage's drawings, and between the status and the usage
const PART_GAP = 1
const WINDOW_GAP = 2
const GROUP_GAP = 2

// The pane /usage-pane opens; the bare /usage is a built-in, which a plugin may not register
const COMMAND = 'usage-pane'
const PANE = 'usage'
const PANE_TITLE = 'Usage'

// How often each session picks up what `/usage-style` last chose in any session
const CHOICE_SYNC_MS = 2_000

// The newest windows any session on this machine was told of, kept in the plugin's store
const SHARED_KEY = 'rateLimits'

// How often a session looks for a newer shared reading and redraws the reset countdowns
const REFRESH_MS = 30_000

// How often the speed row samples the meter; a sample that changes nothing writes nothing
const SPEED_TICK_MS = 1_000

// The speed's reading, written once a second by the meter's tick
const speed = atom({ plugin: 'petline', key: 'speed' } as const, IDLE_SPEED)

// The usage's look this session draws, as `/usage-style` last chose it in any session
const usageLook = atom({ plugin: 'petline', key: 'usageLook' } as const, DEFAULT_USAGE_LOOK as UsageLookId)

// Where the usage is text (the pane on the terminal), each level's percent takes the theme's color for it, light or dark
const THEME_KEY: Record<Level, Color> = { ok: 'success', warn: 'warning', critical: 'error' }

// A window whose reset has passed has started over, with nothing used yet
function percentNow(limit: SessionRateLimit, now: number): number {
  const resetsAt = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)
  return resetsAt <= now ? 0 : Math.round(limit.percentUsed)
}

type UsageWindow = { kind: string; label: string; hours: number; limit: SessionRateLimit }

// The newest reading another session shared, else this session's own: a reading arrives only with a reply
async function latestRateLimits($: EngineInterface): Promise<SessionRateLimit[]> {
  const shared = await $.store.get(SHARED_KEY)
  if (Array.isArray(shared) && shared.length > 0) return shared as SessionRateLimit[]
  return (await $.session.usage()).rateLimits
}

// The windows that have a reading: none off a subscription (API-key billing) and before the first response
async function readWindows($: EngineInterface): Promise<UsageWindow[]> {
  const rateLimits = await latestRateLimits($)
  return Object.entries(WINDOW_HOURS).flatMap(([kind, hours]) => {
    const limit = rateLimits.find(reading => reading.kind === kind)
    return limit === undefined ? [] : [{ kind, label: labelOf(hours), hours, limit }]
  })
}

// What a window shows now (the time until its reset only where there is room for it), and the time it resets
type WindowFacts = WindowReading & { resetAt?: string }

function factsOf(window: UsageWindow, now: number, showReset: boolean): WindowFacts {
  const { limit } = window
  const left = (limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)) - now
  const at = resetTime(limit.resetsAt, now)
  return {
    kind: window.kind,
    label: window.label,
    percent: percentNow(limit, now),
    until: showReset ? untilReset(limit.resetsAt, now) : undefined,
    elapsed: left > 0 ? 1 - left / (window.hours * 3_600_000) : undefined,
    resetAt: at === undefined ? undefined : `${at} 重置`,
  }
}

type UsageElements = Pick<Elements['desktop'], 'Box' | 'Text'>

// While the pointer is on a window's drawing, a card says when it resets (each window's, for a drawing of both); it
// takes no room, so it moves nothing. The surface draws the card its own way, background and all: the text keeps
// the theme's own color
function resetCard({ Box, Text }: UsageElements, facts: readonly WindowFacts[]) {
  const lines = facts.flatMap(f => (f.resetAt === undefined ? [] : [facts.length > 1 ? `${f.label} ${f.resetAt}` : f.resetAt]))
  if (lines.length === 0) return null
  return (
    <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
      {lines.map(line => (
        <Text>{line}</Text>
      ))}
    </Box>
  )
}

// The usage in the look `/usage-style` chose: its drawings in a row (the band) or a column (the pane), each with its card
function usageGroup(
  elements: UsageElements & Pick<Elements['desktop'], 'Svg'>,
  look: UsageLookId,
  facts: readonly WindowFacts[],
  direction: 'row' | 'column',
) {
  const { Box, Svg } = elements
  return (
    <Box key="usage" flexDirection={direction} alignItems={direction === 'row' ? 'center' : 'flex-start'} columnGap={WINDOW_GAP} rowGap={1}>
      {drawUsage(look, facts).map(drawn => (
        <Box key={drawn.kinds.join('+')} flexDirection="row" alignItems="center">
          <Svg source={drawn.svg} alt={drawn.alt} width={drawn.width} height={drawn.height} />
          {resetCard(elements, facts.filter(f => drawn.kinds.includes(f.kind)))}
        </Box>
      ))}
    </Box>
  )
}

// A window as text, where nothing draws an Svg (the pane on the terminal): label, percent, time left
function windowText(elements: UsageElements, f: WindowFacts) {
  const { Box, Text } = elements
  return (
    <Box key={f.kind} flexDirection="row" columnGap={PART_GAP}>
      <Text dimColor>{f.label}</Text>
      <Text color={THEME_KEY[levelFor(f.percent)]} bold>{`${f.percent}%`}</Text>
      {f.until === undefined ? null : <Text dimColor>{f.until}</Text>}
      {resetCard(elements, [f])}
    </Box>
  )
}

// The fewest cells the cat's lane takes, the cat walking on the spot, and the cells the status takes
const LANE_MIN_COLUMNS = pxColumns(FIGURE_WIDTH)
const STATUS_COLUMNS = pxColumns(STATUS_WIDTH)

// The cells the row's right takes for a fit: the status, then the usage's drawings when there is any. They hold one
// width whatever the state, so a change of state never brings the reset times and takes them away again
function rightColumns(look: UsageLookId, windows: readonly UsageWindow[], now: number, { showReset }: Fit): number {
  const groups = [STATUS_COLUMNS]
  if (windows.length > 0) {
    const drawn = drawUsage(look, windows.map(w => factsOf(w, now, showReset)))
    groups.push(rowColumns(drawn.map(d => pxColumns(d.width)), WINDOW_GAP))
  }
  return rowColumns(groups, GROUP_GAP)
}

// The row's fit, and the cells the lane starts from: what the right leaves, or where even the barest row is too
// wide for the band, a line of its own above the rest. The lane then grows into whatever the row has left over:
// cells are wider than the plugin reckons them, by how much it cannot tell
function layOut(columns: number, right: (fit: Fit) => number): { fit: Fit; laneColumns: number } {
  const fit = fitRow(columns, f => LANE_MIN_COLUMNS + right(f))
  const spare = columns - right(fit)
  return { fit, laneColumns: spare >= LANE_MIN_COLUMNS ? spare : columns }
}

// The lane's width in pixels as the plugin reckons it from its cells: what paces the walk and spaces the ground. The
// lane's frames are as wide as the band makes the lane, and the drawing fits them (see lane.ts)
export const lanePx = (laneColumns: number) => Math.max(columnsPx(laneColumns), FIGURE_WIDTH)

// The widest an Svg may ask to be: the lane's frames ask for it, and the surface, which caps a drawing at its slot,
// gives them the lane's own width
export const SVG_MAX_WIDTH = 4096

// Where the lane's frame not shown waits, in cells: far outside the band, which clips it. Moved rather than hidden,
// it stays mounted and keeps playing, ready to come in
const OUT_OF_VIEW = -10_000

// An empty drawing the cat's size: it holds the lane's height in the row, the frames laid over the lane
const LANE_SPACE = `<svg xmlns="http://www.w3.org/2000/svg" width="${FIGURE_WIDTH}" height="${FIGURE_HEIGHT}" viewBox="0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}"/>`

// The lane the cat walks, starting from `laneColumns` cells and taking all the row leaves: its two frames at one
// place, as wide as the lane, the one not shown out of view (see FrameBuffer), each in a frame of its own, so
// redraws of the band don't restart it
function laneOf({ Box, Svg }: Pick<Elements['desktop'], 'Box' | 'Svg'>, reading: Speed, laneColumns: number) {
  const { frames } = reading
  const width = lanePx(laneColumns)
  return (
    <Box key="lane" flexDirection="row" width={laneColumns} flexGrow={1} flexShrink={1}>
      <Svg source={LANE_SPACE} alt={`小猫，${reading.tps} t/s`} width={FIGURE_WIDTH} height={FIGURE_HEIGHT} />
      {frames.drawings.map((drawing, k) => (
        <Box key={`cat-frame-${k}`} position="absolute" top={0} left={k === frames.front ? 0 : OUT_OF_VIEW} width="100%">
          <Svg source={drawLane(drawing, width)} alt="小猫" width={SVG_MAX_WIDTH} height={FIGURE_HEIGHT} isInteractive />
        </Box>
      ))}
    </Box>
  )
}

// What the session is doing, an image of one width set beside the usage; the cat's ground carried on into it while
// the cat is up and the lane is on its line, right before it
function statusOf({ Box, Svg }: Pick<Elements['desktop'], 'Box' | 'Svg'>, reading: Speed, ground: boolean) {
  return (
    <Box key="status">
      <Svg source={drawStatus(reading, ground)} alt={statusAlt(reading)} width={STATUS_WIDTH} height={STATUS_HEIGHT} />
    </Box>
  )
}

// Whether a drawing shows nothing: none at all, the engine's own band (with no survey, which the band yields to,
// it has nothing to show), or boxes and texts with nothing in them
function isBlank(node: RenderChildren): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return true
  if (typeof node === 'string') return node.trim() === ''
  if (typeof node === 'number') return false
  if (Array.isArray(node)) return node.every(isBlank)
  const element = node as RenderElement
  if (element.type === 'engine') return true
  if (element.type === 'Box' || element.type === 'Text') return isBlank(element.children)
  return false
}

// A choice a command makes for every session on this machine: kept in the store under `key`, which what each session
// draws follows within CHOICE_SYNC_MS. The command moves on from the last choice in any session, not this one's:
// another session may have chosen since. What a session draws is an atom of its own, which each choice's hooks
// read and write by name: the engine's scan of `$.state` reads an atom only where it is named
type Choice<T extends string> = {
  command: string
  description: string
  noun: string
  key: string
  ids: readonly T[]
  labelOf(id: T): string
}

const USAGE_CHOICE: Choice<UsageLookId> = {
  command: 'usage-style',
  description: '切换输入框上方的用量样式：不带参数换下一个，带编号或名称直接选定',
  noun: '用量样式',
  key: 'usageLook',
  ids: USAGE_LOOK_IDS,
  labelOf: id => USAGE_LOOKS[id].label,
}

// What a command names: an id, a label or a place in the list (from 1); the next one when it names none
function chooseFrom<T extends string>(choice: Choice<T>, current: T, args: string): T | undefined {
  const { ids } = choice
  const wanted = args.trim()
  if (wanted === '') return ids[(ids.indexOf(current) + 1) % ids.length]
  const place = Number(wanted)
  if (Number.isInteger(place) && place >= 1 && place <= ids.length) return ids[place - 1]
  return ids.find(id => id === wanted || choice.labelOf(id) === wanted)
}

function choiceList<T extends string>(choice: Choice<T>, current: T): string {
  return choice.ids.map((id, k) => `${k + 1}. ${choice.labelOf(id)}${id === current ? '（当前）' : ''}`).join('  ')
}

// The last choice in any session, or undefined before the first
async function keptChoice<T extends string>($: EngineInterface, choice: Choice<T>): Promise<T | undefined> {
  const kept = await $.store.get(choice.key)
  return choice.ids.find(id => id === kept)
}

// The last choice, wherever it was made, when it is not the one `drawn`; undefined when it is, or can't be read
async function newerChoice<T extends string>($: EngineInterface, choice: Choice<T>, drawn: T): Promise<T | undefined> {
  const kept = await keptChoice($, choice).catch(() => undefined)
  return kept === drawn ? undefined : kept
}

// Each session follows what `/usage-style` last chose
async function syncChoices($: EngineInterface) {
  const look = await newerChoice($, USAGE_CHOICE, await read($, usageLook))
  if (look !== undefined) await update($, usageLook, () => look)
}

// What a command makes of its arguments, from the last choice in any session (else the one `drawn`): the choice,
// kept in the store before the session draws it (one the store didn't take would be undone by the next sync), and
// the command's answer
async function makeChoice<T extends string>($: EngineInterface, choice: Choice<T>, drawn: T, args: string) {
  const current = (await keptChoice($, choice)) ?? drawn
  const chosen = chooseFrom(choice, current, args)
  if (chosen === undefined) return { text: `没有叫「${args.trim()}」的${choice.noun}。可选：${choiceList(choice, current)}` }
  await $.store.set(choice.key, chosen)
  return { chosen, text: `已换成「${choice.labelOf(chosen)}」。可选：${choiceList(choice, chosen)}` }
}

// The room the cat's lane leaves it to walk, in pixels, as the band was last laid out: the lane less the cat itself
type Lane = { room: number }

// Writes this second's reading for the band, the cat's frames with it, unless it is the one the band already shows
async function publishSpeed($: EngineInterface, meter: Meter, gait: Gait, frames: FrameBuffer, lane: Lane, shown: { serialized: string }) {
  const now = await $.clock.now()
  const measured = meter.tick(now)
  const working = measured.phase !== 'idle'
  const drawn = frames.next(gait.next(working, measured.tps, now, lane.room))
  const reading: Speed = { ...measured, frames: drawn, ground: gait.upAt(now, lane.room) }
  const serialized = JSON.stringify(reading)
  if (serialized === shown.serialized) return
  shown.serialized = serialized
  await update($, speed, () => reading)
}

export const register: Register = on => {
  // What streams and runs, counted across every loop; the tick turns it into the row's reading
  const meter = new Meter()
  const gait = new Gait()
  const frames = new FrameBuffer()
  const lane: Lane = { room: 0 }
  const shown = { serialized: '' }
  let calls = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show 5-hour and 7-day usage in a pane' })
    await $.command.register({ name: USAGE_CHOICE.command, description: USAGE_CHOICE.description, argumentHint: '[编号或名称]' })
    // Picks up what other sessions shared and keeps the reset countdowns current while this one sits idle
    $.clock.every(REFRESH_MS, () => $.ui.invalidate('ui.render'))
    $.clock.every(SPEED_TICK_MS, () => void publishSpeed($, meter, gait, frames, lane, shown))
    $.clock.every(CHOICE_SYNC_MS, () => void syncChoices($).catch(() => {}))
    await syncChoices($).catch(() => {})
    return next(e)
  })

  on('command.run', { command: USAGE_CHOICE.command }, async ($, e) => {
    const { chosen, text } = await makeChoice($, USAGE_CHOICE, await read($, usageLook), e.args)
    if (chosen !== undefined) await update($, usageLook, () => chosen)
    return { text }
  }).catch(() => ({ text: `没能切换${USAGE_CHOICE.noun}。` }))

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) meter.turnStarted()
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) meter.turnEnded()
    return next(e)
  })

  // Counts each piece of a reply as it streams, passing it on untouched; the stop's usage calibrates the count
  on('turn.step', async function* ($, e, next) {
    meter.stepStarted()
    let estimated = 0
    try {
      for await (const chunk of next(e)) {
        if (chunk.kind === 'stop') {
          if (chunk.usage !== null) meter.calibrate(estimated, chunk.usage.output_tokens)
        } else {
          estimated += meter.streamed(chunk)
        }
        yield chunk
      }
    } finally {
      meter.stepEnded()
    }
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `call-${++calls}`
    meter.toolStarted(id, String(e.tool), await $.clock.now())
    try {
      return await next(e)
    } finally {
      meter.toolEnded(id)
    }
  })

  // The permission dialog is about to show: the row says what it waits on until the call ends or the model writes again
  on('classic.PermissionRequest', async ($, e, next) => {
    meter.permissionAsked(e.tool_name, await $.clock.now())
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: opened.isPlaced ? 'Usage pane opened.' : `Usage pane opened but not shown yet: ${opened.reason}` }
  }).catch(() => ({ text: 'Could not open the usage pane.' }))

  // When a window moves a whole point, appears or leaves: shares the reading with the other sessions, then redraws
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      if (e.rateLimits.length > 0) await $.store.set(SHARED_KEY, e.rateLimits)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Drawn in the Desktop app and the IDE alone: a terminal has a status line of its own
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)

    const elements = $.ui.resolve(e)
    if (!('Svg' in elements)) return next(e)
    const { Box, Svg, Text } = elements

    // One row: the cat's lane at its left, taking what the rest leaves, then the status and the usage, once there
    // is a reading (none under API-key billing), at its right; where the band is too narrow for all of it, the reset
    // times go
    const reading = await read($, speed)
    const windows = await readWindows($)
    const now = await $.clock.now()
    const look = await read($, usageLook)
    const { fit, laneColumns } = layOut(e.props.bodyColumns, f => rightColumns(look, windows, now, f))
    lane.room = lanePx(laneColumns) - FIGURE_WIDTH
    // The lane runs right up to the status, where its ground carries on; where the row wraps, it has a line of its own
    const sameLine = laneColumns < e.props.bodyColumns
    const right = [statusOf({ Box, Svg }, reading, reading.ground && sameLine)]
    if (windows.length > 0) {
      right.push(usageGroup({ Box, Svg, Text }, look, windows.map(w => factsOf(w, now, fit.showReset)), 'row'))
    }

    const row = (
      <Box width="100%" flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center">
        {laneOf({ Box, Svg }, reading, laneColumns)}
        <Box key="right" flexDirection="row" alignItems="center" columnGap={GROUP_GAP}>
          {right}
        </Box>
      </Box>
    )
    // The band is one site: what the mods after this one draw goes below the row, or keeping it would hide them
    const below = await next(e)
    return isBlank(below) ? row : (
      <Box flexDirection="column">
        {row}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const windows = await readWindows($)
    if (windows.length === 0) {
      return <Text dimColor>No usage yet: it arrives with the first reply on a subscription.</Text>
    }

    const now = await $.clock.now()
    const facts = windows.map(w => factsOf(w, now, true))
    // The terminal's table answers `Svg` with a stand-in that draws none of a drawing: there the windows are text
    if (e.surface === 'terminal' || !('Svg' in elements)) {
      return (
        <Box flexDirection="column" rowGap={1}>
          {facts.map(f => windowText({ Box, Text }, f))}
        </Box>
      )
    }
    return usageGroup({ Box, Text, Svg: elements.Svg }, await read($, usageLook), facts, 'column')
  })
}

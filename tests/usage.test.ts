import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On, SessionRateLimit, SvgProps, UiOpenResult } from 'claude-code'

import { pxColumns, rowColumns } from '../hooks/layout'
import { resetTime, untilReset } from '../hooks/resets'
import { STATUS_WIDTH } from '../hooks/status'
import { LEVEL_COLOR } from '../hooks/usage-looks'
import { beneath, typed } from './support'

const NOW = Date.parse('2026-10-10T12:00:00Z')


test('the time until a reset reads as hh:mm, with the days before it when there are any', () => {
  const after = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
  expect([9, 60, 134, 1439, 3 * 1440 + 240].map(m => untilReset(after(m), NOW))).toEqual(['00:09', '01:00', '02:14', '23:59', '3天04:00'])
  // Part of a minute counts a whole one; a reset that has passed, or none, says nothing
  expect(untilReset(new Date(NOW + 30_000).toISOString(), NOW)).toBe('00:01')
  expect([untilReset(after(-1), NOW), untilReset(undefined, NOW)]).toEqual([undefined, undefined])
})

test('the time a reset falls reads on this machine\'s clock: today, tomorrow, or its date', () => {
  // Built from this machine's own clock, so it holds in any time zone
  const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
  const at = (t: number) => new Date(t).toISOString()
  const now = local(10, 9, 5)
  expect(resetTime(at(local(10, 15, 30)), now)).toBe('今天 15:30')
  expect(resetTime(at(local(11, 8)), now)).toBe('明天 08:00')
  expect(resetTime(at(local(13, 16)), now)).toBe('10月13日 16:00')
  expect([resetTime(at(local(10, 9)), now), resetTime(undefined, now)]).toEqual([undefined, undefined])
})

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const band = (bodyColumns = 120) =>
  ({ component: 'AbovePrompt', props: bandProps(bodyColumns) }) as const

const pane = {
  component: 'Pane',
  requestId: 'usage',
  props: {
    title: 'Usage',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Answers $.session.usage() beneath the plugin with these windows, $.store with what other sessions shared, and
// draws `below` beneath the band (the engine's empty band when not given)
function usageWith(
  on: On,
  rateLimits: SessionRateLimit[],
  { shared, below }: { shared?: SessionRateLimit[]; below?: Parameters<typeof beneath>[1] } = {},
) {
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits } }))
  mock.store(on, shared === undefined ? {} : { rateLimits: shared })
  beneath(on, below)
}

// A window as a reply reports it: how much of it is used, and when it resets
const reading = (kind: string, percentUsed: number, resetsAt?: string): SessionRateLimit => ({ kind, percentUsed, resetsAt })

// Both windows: the five-hour one 42% used, two hours fourteen from its reset; the seven-day one 91%, three days
// four hours from it
const LIMITS = [reading('five_hour', 42.4, '2026-10-10T14:14:00Z'), reading('seven_day', 91, '2026-10-13T16:00:00Z')]

test('each window is a drawing of its own, saying how much is used, in its level\'s color, and when it resets', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ plugin: 'petline', surface, ...band() })
    expect(await alts(ui)).toEqual(['5h usage 42%，02:14 后重置', '7d usage 91%，3天04:00 后重置'])
    const [fiveHour, sevenDay] = await sources(ui)
    // Each bar filled in its level's color
    expect(fiveHour).toContain(`rx="2" fill="${LEVEL_COLOR.ok}"`)
    expect(sevenDay).toContain(`rx="2" fill="${LEVEL_COLOR.critical}"`)
    // The drawings say it all: no text beside them says it again
    expect(await ui.find({ type: 'Text', text: /%|5h|7d/ })).toBeUndefined()
    await ui.unmount()
  }
})

// The usage's drawings in display order (5h, then 7d), what each says, and its SVG: the band's other drawings are
// the speed row's
type Found = Pick<Mounted<'desktop', 'AbovePrompt' | 'Pane'>, 'findAll'>

async function drawings(ui: Found) {
  return (await ui.findAll({ type: 'Svg' })).map(svg => svg.props as SvgProps).filter(svg => svg.alt.includes('usage'))
}

const alts = async (ui: Found) => (await drawings(ui)).map(svg => svg.alt)
const sources = async (ui: Found) => (await drawings(ui)).map(svg => svg.source)

test('the terminal\'s band is left as it is: it has a status line of its own', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS, { below: ({ Box }) => Box({ key: 'engine-band' }) })
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'terminal', ...band() })
  expect(await ui.find({ key: 'engine-band' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h|7d|%/ })).toBeUndefined()
  await ui.unmount()
})

test('on a narrow band the drawings leave out the time until each reset, which hovering still tells', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band(40) })
  expect(await alts(ui)).toEqual(['5h usage 42%', '7d usage 91%'])
  // Hovering a window still says when it resets
  expect(await resetCards(ui)).toHaveLength(2)
  await ui.unmount()
})

// The cards that say when each window resets, in display order: laid over the row, and hidden until hovered
async function resetCards(ui: Found) {
  return (await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute' && box.props.display === 'none')
}

test('hovering a window shows when it resets, in a card that takes no room', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  for (const component of [band(), pane] as const) {
    const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...component })
    const cards = await resetCards(ui)
    expect(cards.map(card => card.text)).toEqual(LIMITS.map(limit => `${resetTime(limit.resetsAt, NOW)} 重置`))
    for (const card of cards) {
      expect(card.props).toMatchObject({ display: 'none', top: 0, right: 0 })
      // The app draws the card's background: a color of the card's own could leave its text unreadable on it
      expect(card.props.backgroundColor).toBeUndefined()
      expect((card.children[0] as { props?: Record<string, unknown> }).props?.color).toBeUndefined()
    }
    expect(JSON.stringify(await ui.drawn())).toContain('"hover":{"display":"flex"}')
    await ui.unmount()
  }
})

test('drawn as two rings, the windows share one card that says when each resets', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  await $.command.run(typed('usage-style', '同心双环'))
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await alts(ui)).toEqual(['5h usage 42%，02:14 后重置；7d usage 91%，3天04:00 后重置'])
  const cards = await resetCards(ui)
  expect(cards).toHaveLength(1)
  for (const limit of LIMITS) expect(cards[0]?.text).toContain(`${resetTime(limit.resetsAt, NOW)} 重置`)
  expect(cards[0]?.text).toContain('5h ')
  await ui.unmount()
})

// How many reset times one row keeps at a width: the cat walking on the spot (5 cells), the status right beside it
// (17) and both windows' gauges (15 each), with their gaps, need 56
async function resetsKeptAt($: Engine, columns: number) {
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band(columns) })
  const kept = (await alts(ui)).filter(alt => alt.includes('后重置')).length
  await ui.unmount()
  return kept
}

test('a band too narrow for one row gives up the reset times', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  expect(await resetsKeptAt($, 56)).toBe(2)
  expect(await resetsKeptAt($, 55)).toBe(0)
})

// The lane's box and its frames' slots, and the widths of the status and the usage's drawings beside it
async function laneAt($: Engine, columns: number) {
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band(columns) })
  const lane = (await ui.find({ key: 'lane' }))?.props
  const slots = await Promise.all([0, 1].map(async k => (await ui.find({ key: `cat-frame-${k}` }))?.props.width))
  const svgs = (await ui.findAll({ type: 'Svg' })).map(svg => svg.props as SvgProps)
  await ui.unmount()
  const right = svgs.filter(svg => svg.width === STATUS_WIDTH || svg.alt.includes('usage')).map(svg => Number(svg.width))
  return { lane, slots, right }
}

test('the cat\'s lane starts from what the status and the usage leave and grows into the rest; past the barest row, a line of its own', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  const { lane, slots, right } = await laneAt($, 120)
  // The status, right beside the lane, then the usage's drawings two cells apart
  const [status, ...usage] = right.map(pxColumns)
  expect(lane).toMatchObject({ width: 120 - (status! + 2 + rowColumns(usage, 2)), flexGrow: 1 })
  // Its frames as wide as it, whatever the band makes it
  expect(slots).toEqual(['100%', '100%'])
  expect((await laneAt($, 40)).lane).toMatchObject({ width: 40 })
})

test('a window no reply has reported is left out', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, [{ kind: 'seven_day', percentUsed: 75 }])
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await alts(ui)).toEqual(['7d usage 75%'])
  expect((await sources(ui))[0]).toContain(`rx="2" fill="${LEVEL_COLOR.warn}"`)
  expect(await ui.find({ text: /重置/ })).toBeUndefined()
  await ui.unmount()
})

test('without rate limits (API-key billing) the band holds the pet and the status alone', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, [])
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await ui.find({ key: 'lane' })).toBeDefined()
  expect(await ui.find({ key: 'status' })).toBeDefined()
  expect(await ui.find({ key: 'usage' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /5h|7d|%/ })).toBeUndefined()
  await ui.unmount()
})

test('a mod placed after this one draws its line below the row', async ($, on) => {
  mock.clock(on, { now: NOW })
  // Another mod beneath this one, as Token Weather draws its line
  usageWith(on, LIMITS, { below: ({ Box, Text }) => Box({ key: 'other-mod', children: [Text({ children: '☂ 634k' })] }) })
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  const drawn = await ui.drawn()
  expect(drawn).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } })
  // The row first, holding the cat's lane; the other mod's line after it
  const [row, other] = (drawn as { children?: { props?: Record<string, unknown>; children?: { props?: Record<string, unknown> }[] }[] }).children ?? []
  expect(row?.children?.[0]?.props?.key).toBe('lane')
  expect(other?.props?.key).toBe('other-mod')
  await ui.unmount()
})

test('the cat\'s lane sits at the band\'s left, the status right beside the usage at its right', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  const row = await ui.drawn()
  expect(row).toMatchObject({ type: 'Box', props: { width: '100%', justifyContent: 'space-between' } })
  type Node = { props?: Record<string, unknown>; children?: Node[] }
  const groups = (row as Node).children ?? []
  expect(groups.map(group => group.props?.key)).toEqual(['lane', 'right'])
  expect(groups[1]?.children?.map(part => part.props?.key)).toEqual(['status', 'usage'])
  await ui.unmount()
})

test('with nothing drawn below, the row is the whole band', async ($, on) => {
  mock.clock(on, { now: NOW })
  // A mod beneath that draws only blank text
  usageWith(on, LIMITS, { below: ({ Box, Text }) => Box({ children: [Text({ children: ' ' })] }) })
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { flexDirection: 'row' } })
  await ui.unmount()
})

// As the person typing /usage-pane at the prompt
const USAGE_PANE_RUN = {
  command: 'usage-pane',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

// Stands for the surface placing the pane, or leaving it to wait; returns the ids opened
function surfaceAnswers(on: On, result: UiOpenResult): string[] {
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: result }
  })
  return opened
}

test('/usage-pane opens the usage pane', async ($, on) => {
  const opened = surfaceAnswers(on, { isPlaced: true })
  const { text } = await $.command.run(USAGE_PANE_RUN)
  expect(opened).toEqual(['usage'])
  expect(text).toBe('Usage pane opened.')
})

test('/usage-pane says why when the surface leaves the pane waiting', async ($, on) => {
  surfaceAnswers(on, { isPlaced: false, reason: 'no attached surface places panes' })
  const { text } = await $.command.run(USAGE_PANE_RUN)
  expect(text).toBe('Usage pane opened but not shown yet: no attached surface places panes')
})

test('shows the newest reading another session shared over this session\'s own', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS, { shared: [{ kind: 'five_hour', percentUsed: 55, resetsAt: '2026-10-10T14:14:00Z' }] })
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await alts(ui)).toEqual(['5h usage 55%，02:14 后重置'])
  await ui.unmount()
})

test('shares a new reading with the other sessions', async ($, on) => {
  // Stands for the plugin's store and for the engine's own measurement beneath the plugin
  const stored: { key: string; value: unknown }[] = []
  on('store.set', ($, e) => {
    stored.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: LIMITS, changed: ['rateLimits'] })
  expect(stored).toEqual([{ key: 'rateLimits', value: LIMITS }])
})

test('a window past its reset reads 0% with no countdown', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, [{ kind: 'five_hour', percentUsed: 88, resetsAt: '2026-10-10T11:00:00Z' }])
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...band() })
  expect(await alts(ui)).toEqual(['5h usage 0%'])
  expect(await resetCards(ui)).toHaveLength(0)
  await ui.unmount()
})

test('the pane draws the windows one under the other, with the time left', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...pane })
  expect(await alts(ui)).toEqual(['5h usage 42%，02:14 后重置', '7d usage 91%，3天04:00 后重置'])
  expect(await ui.find({ key: 'usage' })).toMatchObject({ props: { flexDirection: 'column' } })
  await ui.unmount()
})

test('the pane in the terminal shows the windows without rings', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, LIMITS)
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'terminal', ...pane })
  expect((await ui.find({ type: 'Text', text: '42%' }))?.props).toMatchObject({ color: 'success' })
  expect(await ui.findAll({ type: 'Text', text: /42%/ })).toHaveLength(1)
  expect(await ui.find({ text: '3天04:00' })).toBeDefined()
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  await ui.unmount()
})

test('the pane says so before there is any usage', async ($, on) => {
  mock.clock(on, { now: NOW })
  usageWith(on, [])
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...pane })
  expect(await ui.find({ type: 'Text', text: /No usage yet/ })).toBeDefined()
  await ui.unmount()
})

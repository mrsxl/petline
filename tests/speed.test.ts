import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SvgProps } from 'claude-code'

import { drawLane, FIGURE_HEIGHT, FIGURE_WIDTH, GROUND_Y, RESTING, WALK_SPEED, walkRate } from '../hooks/figures'
import { SCENES } from '../hooks/scenes'
import { estimateTokens, formatSeconds, Meter, shortToolName } from '../hooks/speed'
import { lanePx, SVG_MAX_WIDTH } from '../hooks/register'
import { STATUS_WIDTH } from '../hooks/status'
import { beneath, typed } from './support'

const NOW = Date.parse('2026-10-23T12:00:00Z')

// 350 ASCII characters: 100 tokens before calibration
const HUNDRED_TOKENS = 'a'.repeat(350)

const text = (t: string) => ({ kind: 'text', index: 0, text: t }) as const

test('estimates tokens from streamed text: about 3.5 ASCII characters, or 4/3 wide characters, a token', () => {
  expect(estimateTokens(HUNDRED_TOKENS)).toBe(100)
  expect(estimateTokens('你好世界')).toBe(3)
})

test('names tools and durations the short way', () => {
  expect(shortToolName('mcp__github__create_issue')).toBe('create_issue')
  expect(shortToolName('Bash')).toBe('Bash')
  expect([12, 185, 3720].map(formatSeconds)).toEqual(['12s', '3m 05s', '1h 02m'])
})

test('a second of streamed output is that second\'s rate, smoothed over two seconds', () => {
  const meter = new Meter()
  meter.turnStarted()
  meter.stepStarted()
  meter.streamed(text(HUNDRED_TOKENS))
  const first = meter.tick(NOW)
  expect(first).toMatchObject({ phase: 'responding', tps: 100 })
  meter.streamed(text(HUNDRED_TOKENS.slice(0, 175)))
  expect(meter.tick(NOW + 1000)).toMatchObject({ phase: 'responding', tps: 75 })
})

test('a quiet second keeps the cat running; the next one it thinks; a finished turn rests it', () => {
  const meter = new Meter()
  meter.turnStarted()
  meter.stepStarted()
  meter.streamed(text(HUNDRED_TOKENS))
  meter.tick(NOW)
  expect(meter.tick(NOW + 1000).phase).toBe('responding')
  expect(meter.tick(NOW + 2000)).toMatchObject({ phase: 'thinking' })
  meter.stepEnded()
  meter.turnEnded()
  expect(meter.tick(NOW + 3000)).toMatchObject({ phase: 'idle', tps: 0 })
})

test('thinking that streams is thinking, at its rate', () => {
  const meter = new Meter()
  meter.turnStarted()
  meter.streamed({ kind: 'thinking', index: 0, text: HUNDRED_TOKENS })
  expect(meter.tick(NOW)).toMatchObject({ phase: 'thinking', tps: 100 })
})

test('a running tool shows the newest by name, how long it has run, and how many run beside it', () => {
  const meter = new Meter()
  meter.turnStarted()
  meter.toolStarted('a', 'Read', NOW)
  meter.toolStarted('b', 'mcp__github__search', NOW + 1000)
  expect(meter.tick(NOW + 3000)).toMatchObject({ phase: 'tool', tool: 'search', others: 1, seconds: 2 })
  meter.toolEnded('b')
  expect(meter.tick(NOW + 4000)).toMatchObject({ phase: 'tool', tool: 'Read', seconds: 4 })
  expect(meter.tick(NOW + 4000).others).toBeUndefined()
})

test('a permission dialog waits until its call ends or the model writes again', () => {
  const meter = new Meter()
  meter.turnStarted()
  meter.toolStarted('a', 'Bash', NOW)
  meter.permissionAsked('Bash', NOW)
  expect(meter.tick(NOW + 5000)).toMatchObject({ phase: 'permission', tool: 'Bash', seconds: 5 })
  meter.toolEnded('a')
  expect(meter.tick(NOW + 6000).phase).toBe('thinking')
  meter.permissionAsked('Edit', NOW + 6000)
  meter.streamed(text('ok'))
  expect(meter.tick(NOW + 7000).phase).toBe('responding')
})

test('each reply\'s usage calibrates the estimate, ignoring short replies and unbelievable ratios', () => {
  const meter = new Meter()
  meter.calibrate(100, 150)
  expect(meter.scale.toFixed(2)).toBe('1.15')
  meter.calibrate(100, 500)
  meter.calibrate(10, 30)
  expect(meter.scale.toFixed(2)).toBe('1.15')
})

// --- Through the engine: the hooks count, the tick publishes, the band draws ---

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// The engine beneath the plugin: no usage yet, a session that starts, turns, a reply of `chunks`, and its empty band
function engine(on: On, chunks: readonly { kind: 'text'; index: number; text: string }[] = [], store: Record<string, unknown> = {}) {
  beneath(on)
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  // The plugin's store, in `store` itself, so a test can read back what was kept
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    for (const chunk of chunks) yield chunk
    yield { kind: 'stop', stopReason: 'end_turn', usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
}

async function startSession($: Engine) {
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
}

// The band as drawn: the lane's place (what it says, how wide), its frame in view and the one out of view, and
// what the status says
async function drawBand($: Engine) {
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...BAND })
  const svgs = (await ui.findAll({ type: 'Svg' })).map(svg => svg.props as SvgProps)
  const place = svgs.find(svg => svg.alt.startsWith('小猫，'))!
  const frames = await Promise.all([0, 1].map(async k => {
    const slot = await ui.find({ key: `cat-frame-${k}` })
    return { left: slot?.props.left, svg: (slot?.children[0] as { props: SvgProps } | undefined)?.props }
  }))
  const statusSvg = svgs.find(svg => svg.width === STATUS_WIDTH)
  const status = statusSvg?.alt
  // The width the lane's drawings are made for: the plugin's reckoning of the cells it starts from
  const lane = lanePx(Number((await ui.find({ key: 'lane' }))?.props.width))
  await ui.unmount()
  const shown = frames.find(f => f.left === 0)
  return { place, lane, cat: shown?.svg, hidden: frames.find(f => f !== shown)!, status, carried: statusSvg?.source.includes(`<rect x="0" y="${GROUND_Y}"`) }
}

// A walk's legs at a rate, and its round trip of a lane `lane` pixels wide, as a drawing times them
const legs = (rate: number) => `dur="${Number((SCENES['cat-walking'].seconds / rate).toFixed(3))}s"`
const roundTrip = (lane: number, rate: number) => `dur="${Number(((2 * (lane - FIGURE_WIDTH)) / (WALK_SPEED * rate)).toFixed(3))}s" begin="1s" repeatCount="indefinite"`

test('a streamed reply loads the walk out of view, and shows it a tick later, already playing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, [text(HUNDRED_TOKENS)])
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }));
  await clock.advance(1000)
  const first = await drawBand($)
  // The speed shows in the cat alone: the status says what it does, not how fast
  expect(first.place.alt).toContain('100 t/s')
  expect(first.status).toBe('输出中')
  // Still resting in view; the walk loading far out of it, its legs and its pace at the speed's rate
  expect(first.cat?.source).toBe(drawLane(RESTING, first.lane))
  const walk = first.hidden.svg?.source ?? ''
  expect(walk).toContain(legs(walkRate(100)))
  expect(walk).toContain(roundTrip(first.lane, walkRate(100)))
  expect(first.hidden.left).toBeLessThan(-1000)
  await clock.advance(1000)
  const second = await drawBand($)
  // Asking to be as wide as an Svg may, so the surface gives it the lane's whole width
  expect(second.cat).toMatchObject({ source: walk, isInteractive: true, width: SVG_MAX_WIDTH, height: FIGURE_HEIGHT })
  // The rest stays mounted out of view, until a new drawing takes its place
  expect(second.hidden.svg?.source).toBe(drawLane(RESTING, first.lane))
  // Up and walking, its ground runs on into the status
  expect(second.carried).toBe(true)
})

test('a running tool marks time with its name and how long it has run, the cat walking on', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  let finish = () => {}
  on('tool.call', () => new Promise(resolve => (finish = () => resolve({ result: { stdout: '', stderr: '', interrupted: false } }))))
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const call = $.tool.call({ tool: 'Bash', command: 'sleep 3' })
  await clock.advance(3000)
  const { cat, status } = await drawBand($)
  // The walk came in a tick after the turn started, and stays while the tool runs
  expect(status).toBe('Bash 3s')
  expect(cat?.source).toContain(legs(walkRate(0)))
  finish()
  await call
})

test('before anything happens the cat rests, idle', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const { cat, lane, status, carried } = await drawBand($)
  expect(status).toBe('空闲')
  expect(cat?.source).toBe(drawLane(RESTING, lane))
  // At rest there is no ground, in the lane or the status
  expect(carried).toBe(false)
})

const usageStyle = (args: string) => typed('usage-style', args)

// Both windows, as another session shared them: the band draws the usage from what the store holds
const SHARED = {
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-23T14:14:00Z' },
    { kind: 'seven_day', percentUsed: 91, resetsAt: '2026-10-26T16:00:00Z' },
  ],
}

async function usageAlts($: Engine) {
  const ui = await $.ui.mount({ plugin: 'petline', surface: 'desktop', ...BAND })
  const alts = (await ui.findAll({ type: 'Svg' })).map(svg => (svg.props as SvgProps).alt).filter(alt => alt.includes('usage'))
  await ui.unmount()
  return alts
}

test('/usage-style moves to the next look, keeps the choice, and the band draws it', async ($, on) => {
  mock.clock(on, { now: NOW })
  const store: Record<string, unknown> = { ...SHARED }
  engine(on, [], store)
  await startSession($)
  // The gauges first: a drawing each
  expect(await usageAlts($)).toHaveLength(2)
  expect((await $.command.run(usageStyle(''))).text).toContain('已换成「同心双环」')
  expect(store.usageLook).toBe('rings')
  // The rings: one drawing of both
  expect(await usageAlts($)).toEqual(['5h usage 42%，02:14 后重置；7d usage 91%，3天04:00 后重置'])
})

test('/usage-style picks a look by its place or its name, and says what there is when it knows none', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await startSession($)
  expect((await $.command.run(usageStyle('3'))).text).toContain('已换成「大字排版」')
  expect((await $.command.run(usageStyle('双行仪表'))).text).toContain('已换成「双行仪表」')
  const { text } = await $.command.run(usageStyle('饼图'))
  expect(text).toContain('没有叫「饼图」的用量样式')
  expect(text).toContain('1. 双行仪表（当前）')
})

test('a look chosen in another session shows here within two seconds, and /usage-style moves on from it', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const store: Record<string, unknown> = { ...SHARED }
  engine(on, [], store)
  await startSession($)
  store.usageLook = 'rings'
  await clock.advance(2000)
  expect(await usageAlts($)).toHaveLength(1)
  store.usageLook = 'type'
  expect((await $.command.run(usageStyle(''))).text).toContain('已换成「双行仪表」')
})

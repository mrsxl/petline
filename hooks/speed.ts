import type { TurnStepChunk } from 'claude-code'

import { STILL_FRAMES } from './figures'
import type { Speed, SpeedPhase } from '../types'

// What the meter measures each second: the speed less the cat's, which the plugin draws from it
export type Measured = Omit<Speed, 'frames' | 'ground'>

// A stream that goes quiet stays `responding` this many ticks, so a stall doesn't flip the label
const QUIET_HOLD_TICKS = 1

// A reply's usage recalibrates the estimate only when it is this many tokens or more, and when the ratio
// is believable: hidden thinking is billed as output but never streamed, which would inflate it
const CALIBRATE_MIN_TOKENS = 30
const CALIBRATE_RANGE = [0.5, 2] as const
const CALIBRATE_WEIGHT = 0.3

export const IDLE_SPEED: Speed = { phase: 'idle', tps: 0, frames: STILL_FRAMES, ground: false }

// Tokens in streamed text before the API counts them: about 3.5 ASCII characters a token, and a
// little more than one token per two wide (CJK) characters; each reply's usage corrects the scale
export function estimateTokens(text: string): number {
  let narrow = 0
  let wide = 0
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 0x80) narrow++
    else wide++
  }
  return narrow / 3.5 + wide * 0.75
}

// `mcp__server__tool` reads as `tool`
export function shortToolName(name: string): string {
  return name.startsWith('mcp__') ? (name.split('__').at(-1) ?? name) : name
}

// 12s, 3m 05s, 1h 02m
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`
}

type RunningTool = { name: string; startedAt: number }

/**
 * Counts what streams and what runs, and once a second turns it into a reading. Every loop counts,
 * subagents too, so parallel work walks the cat faster. Its counters are the module's own: a reload
 * starts them over, which only costs the second in progress.
 */
export class Meter {
  private pending = 0
  private streamedKind: 'thinking' | 'output' | null = null
  private steps = 0
  private working = false
  private readonly tools = new Map<string, RunningTool>()
  private permission: { tool: string; since: number } | null = null
  private calibration = 1
  private lastTickAt: number | null = null
  private recent: number[] = []
  private phase: SpeedPhase = 'idle'
  private quietTicks = 0

  turnStarted() {
    this.working = true
  }

  turnEnded() {
    this.working = false
    this.permission = null
  }

  stepStarted() {
    this.steps++
  }

  stepEnded() {
    this.steps = Math.max(0, this.steps - 1)
  }

  // A piece of a reply: returns the tokens it is estimated at (before calibration)
  streamed(chunk: TurnStepChunk): number {
    let tokens: number
    if (chunk.kind === 'text') tokens = estimateTokens(chunk.text)
    else if (chunk.kind === 'thinking') tokens = estimateTokens(chunk.text)
    else if (chunk.kind === 'input') tokens = estimateTokens(chunk.json)
    else return 0
    this.pending += tokens
    this.streamedKind = chunk.kind === 'thinking' ? 'thinking' : 'output'
    // The model is writing again, so nothing waits on the person any more
    this.permission = null
    return tokens
  }

  // A reply ended: what it was estimated at against what the API counted
  calibrate(estimated: number, actual: number) {
    if (estimated < CALIBRATE_MIN_TOKENS || actual <= 0) return
    const ratio = actual / estimated
    if (ratio < CALIBRATE_RANGE[0] || ratio > CALIBRATE_RANGE[1]) return
    this.calibration = this.calibration * (1 - CALIBRATE_WEIGHT) + ratio * CALIBRATE_WEIGHT
  }

  get scale(): number {
    return this.calibration
  }

  toolStarted(id: string, name: string, now: number) {
    this.tools.set(id, { name: shortToolName(name), startedAt: now })
  }

  toolEnded(id: string) {
    const tool = this.tools.get(id)
    this.tools.delete(id)
    if (tool !== undefined && this.permission?.tool === tool.name) this.permission = null
  }

  permissionAsked(tool: string, now: number) {
    this.permission = { tool: shortToolName(tool), since: now }
  }

  tick(now: number): Measured {
    const seconds = this.lastTickAt === null ? 1 : Math.max((now - this.lastTickAt) / 1000, 0.001)
    this.lastTickAt = now
    const rate = (this.pending * this.calibration) / seconds
    const kind = this.streamedKind
    this.pending = 0
    this.streamedKind = null

    this.recent = [...this.recent.slice(-1), rate]
    this.phase = this.nextPhase(kind)
    const tps = Math.round(this.recent.reduce((a, b) => a + b, 0) / this.recent.length)
    const speed: Measured = { phase: this.phase, tps }
    if (this.phase === 'permission' && this.permission !== null) {
      speed.tool = this.permission.tool
      speed.seconds = Math.round((now - this.permission.since) / 1000)
    } else if (this.phase === 'tool') {
      const newest = [...this.tools.values()].at(-1)
      if (newest !== undefined) {
        speed.tool = newest.name
        speed.seconds = Math.round((now - newest.startedAt) / 1000)
        if (this.tools.size > 1) speed.others = this.tools.size - 1
      }
    }
    return speed
  }

  private nextPhase(kind: 'thinking' | 'output' | null): SpeedPhase {
    if (kind !== null) {
      this.quietTicks = 0
      return kind === 'thinking' ? 'thinking' : 'responding'
    }
    if (this.permission !== null) return 'permission'
    if (this.tools.size > 0) return 'tool'
    if (this.working || this.steps > 0) {
      if (this.phase === 'responding' && this.quietTicks++ < QUIET_HOLD_TICKS) return 'responding'
      return 'thinking'
    }
    return 'idle'
  }
}

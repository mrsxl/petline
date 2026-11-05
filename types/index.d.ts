// What the speed row draws from, as the meter publishes it once a second

/** What the session is busy with: the row's label follows it, the cat whether it is idle */
export type SpeedPhase = 'idle' | 'thinking' | 'responding' | 'tool' | 'permission'

/** The cat's pose: walking while the session works, stretched out while it is idle */
export type Pose = 'run' | 'rest'

/**
 * What the cat draws from: its pose, the rate its walk plays at, when the legs' loop begins (seconds, after the
 * drawing loads), and `travel` in pixels: walking, how far it has walked the lane by the time the walk sets off,
 * which says where it is and which way it faces; idle, where it strolls home from to the lane's left end
 */
export type FigureInputs = { pose: Pose; rate: number; begin: number; travel: number }

/** The cat's two frames at one place, and the one shown */
export type Frames = { drawings: [FigureInputs, FigureInputs]; front: 0 | 1 }

export type Speed = {
  phase: SpeedPhase
  /** Output tokens per second over the last two seconds: an estimate, calibrated by each reply's usage */
  tps: number
  /** The cat's two frames: a new drawing loads in the one not shown and comes in a tick later (see FrameBuffer) */
  frames: Frames
  /** Whether the cat is up, on its ground: walking, or hurrying home and not there yet */
  ground: boolean
  /** The tool running (the newest, when several are) or waiting for approval */
  tool?: string
  /** How many other tools are running beside it */
  others?: number
  /** Seconds the tool has run, or the approval has waited */
  seconds?: number
}

/** The looks `/usage-style` switches the usage between */
export type UsageLookId = 'gauge' | 'rings' | 'type'

declare module 'claude-code' {
  interface PluginState {
    'petline': { speed: Speed; usageLook: UsageLookId }
  }
}

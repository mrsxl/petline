// What the band's drawings are drawn with: their colors, light with each one's dark (see scheme.ts), the system
// font (a drawing is an image, which reaches none of the app's fonts), and how to set text in it

import { darkScheme } from './scheme'

export const INK = { primary: '#1f1f1f', secondary: '#86868b', track: '#000000', trackOpacity: 0.08 } as const

// The hues the drawings pick from, in the middle of the range so they read on light and dark alike
export const HUE = {
  green: '#2f9e64',
  amber: '#d99a1e',
  red: '#e0483e',
  violet: '#8a63e8',
  mint: '#2fb380',
  blue: '#5f86e0',
} as const

// Each light color's dark one: text a light grey, the hues a little brighter
export const DARK_COLOR: Readonly<Record<string, string>> = {
  [INK.primary]: '#ececec',
  [INK.secondary]: '#98989d',
  [HUE.green]: '#3fb57a',
  [HUE.amber]: '#e8ad3a',
  [HUE.red]: '#f0605a',
  [HUE.violet]: '#a88bf5',
  [HUE.mint]: '#4fd39b',
  [HUE.blue]: '#7d9df0',
}

// The line art's black lines and white fills (the cat, and the ground it walks on), in a light appearance; a dark
// one swaps them for light lines and fills of the band's own grey
export const LINE_ART = { line: INK.primary, fill: '#ffffff' } as const
export const LINE_ART_DARK: Readonly<Record<string, string>> = { [LINE_ART.line]: DARK_COLOR[INK.primary]!, [LINE_ART.fill]: '#262626' }

// The style every drawing carries: each color swapped for its dark one, and the black track made faint white
export const DARK = darkScheme(DARK_COLOR, `[fill="${INK.track}"]{fill:#ffffff;fill-opacity:0.13}`)

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

// A number to `digits` places, as short as it will go: hundredths do for a drawing's lengths, thousandths for its times
export const fixed = (n: number, digits = 2) => Number(n.toFixed(digits))

// A text's width in the system font, a little over rather than under, to lay out by
export function textWidth(s: string, size: number, bold = false): number {
  let em = 0
  for (const ch of s) {
    if (/[0-9]/.test(ch)) em += 0.62
    else if (ch === ':' || ch === ' ' || ch === '·') em += 0.3
    else if (ch === '%') em += 0.86
    else if (/[A-Z]/.test(ch)) em += 0.68
    else if (/[a-z_]/.test(ch)) em += 0.56
    else if ((ch.codePointAt(0) ?? 0) > 0x2e80) em += 1
    else em += 0.6
  }
  return em * size * (bold ? 1.04 : 1)
}

// A baseline that centers digits of `size` on `cy`: they stand about 0.7 of their size tall
export const baseline = (cy: number, size: number) => fixed(cy + size * 0.35)

export const text = (x: number, y: number, body: string, size: number, fill: string, weight = 500, anchor = 'start') =>
  `<text x="${fixed(x)}" y="${fixed(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${body}</text>`

// A whole drawing, `width` by `height`, carrying the dark style
export const svgOf = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${DARK}${body}</svg>`

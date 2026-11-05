// Drawings follow the surface's light or dark appearance by themselves. Each is drawn in its light colors and
// carries a style that swaps every one of them for its dark one under `prefers-color-scheme: dark`, which the desktop
// app sets from its own Appearance setting. No setting of Claude Code's can tell: the app's appearance is its own
// (the `theme` setting is the terminal's), and a drawing is an image, which inherits no color from the page.

const PAINTS = ['fill', 'stroke', 'stop-color'] as const

// The style for a drawing whose light colors `swaps` maps to dark ones, with any `extra` rules for a dark appearance
export function darkScheme(swaps: Readonly<Record<string, string>>, extra = ''): string {
  const rules = Object.entries(swaps)
    .flatMap(([light, dark]) => PAINTS.map(paint => `[${paint}="${light}"]{${paint}:${dark}}`))
    .join('')
  return `<style>@media (prefers-color-scheme: dark){${rules}${extra}}</style>`
}

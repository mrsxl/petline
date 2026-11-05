import type { Elements, On, RenderElement } from 'claude-code'

type Drawing = (elements: Pick<Elements['desktop'], 'Box' | 'Text'>) => RenderElement

// What the band holds beneath this plugin, which the tests stand in for: by default the engine's own band, empty
// while no survey holds it; or what another mod draws there
export function beneath(on: On, draw: Drawing = ({ Box }) => Box({})) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => draw($.ui.resolve(e)))
}

// A slash command as the person types it at the prompt
export const typed = (command: string, args = '') =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

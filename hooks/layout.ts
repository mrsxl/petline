// Keeping the band to one row: what each part takes in the cells the band is laid out in, and what the
// row gives up, in order, when the band is too narrow for all of it

// Desktop cells run about 8-9 CSS px; the lower figure errs toward fitting
const PX_PER_COLUMN = 8

// East Asian wide characters and emoji take two cells; variation selectors and joiners none
function cellsOf(code: number): number {
  if (code === 0xfe0f || code === 0x200d) return 0
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x231a && code <= 0x23ff) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  return wide ? 2 : 1
}

export function columnsOf(text: string): number {
  let columns = 0
  for (const ch of text) columns += cellsOf(ch.codePointAt(0) ?? 0)
  return columns
}

// A drawing's width in cells, rounded up
export function pxColumns(px: number): number {
  return Math.ceil(px / PX_PER_COLUMN)
}

// The pixels a run of cells surely spans: the lower figure, so a drawing this wide fits in them
export function columnsPx(columns: number): number {
  return columns * PX_PER_COLUMN
}

// A row of parts, each its width in cells, with `gap` cells between them
export function rowColumns(parts: readonly number[], gap: number): number {
  return parts.reduce((sum, part) => sum + part, 0) + gap * Math.max(parts.length - 1, 0)
}

export type Fit = { showReset: boolean }

// What the row keeps, in order of preference: the reset times, then not
const FITS: readonly Fit[] = [{ showReset: true }, { showReset: false }]

// The first fit whose row is no wider than the band; the barest one, wrapping, when none is
export function fitRow(columns: number, width: (fit: Fit) => number): Fit {
  return FITS.find(fit => width(fit) <= columns) ?? FITS[FITS.length - 1]!
}

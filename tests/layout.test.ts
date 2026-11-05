import { expect, test } from 'claude-code/testing'

import { columnsOf, fitRow, pxColumns, rowColumns } from '../hooks/layout'

test('wide characters and emoji take two cells, a variation selector none', () => {
  expect(columnsOf('5h')).toBe(2)
  expect(columnsOf('3天04:00')).toBe(8)
  expect(columnsOf('💭 思考中')).toBe(9)
  expect(columnsOf('✍️ 输出中')).toBe(9)
  expect(columnsOf('⏳ Bash 12s')).toBe(11)
})

test('a drawing rounds up to whole cells, and a row counts its gaps', () => {
  expect([pxColumns(16), pxColumns(35), pxColumns(48)]).toEqual([2, 5, 6])
  expect(rowColumns([2, 3, 4], 1)).toBe(11)
  expect(rowColumns([], 2)).toBe(0)
})

test('a narrow band gives up the reset times', () => {
  const width = ({ showReset }: { showReset: boolean }) => 50 + (showReset ? 20 : 0)
  expect(fitRow(70, width)).toEqual({ showReset: true })
  expect(fitRow(69, width)).toEqual({ showReset: false })
  expect(fitRow(10, width)).toEqual({ showReset: false })
})

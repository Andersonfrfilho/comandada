// Minimal RFC 4180 reader: quoted cells may hold commas and doubled quotes, which the menu CSVs use.
export function parseCsv(text: string): Record<string, string>[] {
  const rows = readRows(text.replace(/^﻿/, ''))
  const [header, ...body] = rows
  if (!header) return []
  return body
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => Object.fromEntries(header.map((column, index) => [column.trim(), cells[index] ?? ''])))
}

function readRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let isQuoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (isQuoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') isQuoted = false
      else cell += character
      continue
    }
    if (character === '"') isQuoted = true
    else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      rows.push([...row, cell.replace(/\r$/, '')])
      row = []
      cell = ''
    } else cell += character
  }
  if (cell.length > 0 || row.length > 0) rows.push([...row, cell])
  return rows
}

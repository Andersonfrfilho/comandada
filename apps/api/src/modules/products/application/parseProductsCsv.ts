export interface ParsedProductRow {
  row: number
  name: string
  description?: string
  price: number
  unit?: string
  barcode?: string
  catalogName?: string
}

export interface ParseProductsCsvResult {
  rows: ParsedProductRow[]
  errors: { row: number; message: string }[]
}

const COLUMN_ALIASES: Record<string, string> = {
  nome: 'name',
  name: 'name',
  preco: 'price',
  'preço': 'price',
  price: 'price',
  descricao: 'description',
  'descrição': 'description',
  description: 'description',
  unidade: 'unit',
  unit: 'unit',
  'codigo_barras': 'barcode',
  'código_barras': 'barcode',
  barcode: 'barcode',
  catalogo: 'catalogName',
  'catálogo': 'catalogName',
  catalog: 'catalogName',
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
}

export function parseProductsCsv(csvText: string): ParseProductsCsvResult {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const errors: ParseProductsCsvResult['errors'] = []

  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'Arquivo CSV vazio' }] }
  }

  const headerCells = splitCsvLine(lines[0]!).map(normalizeHeader)
  const columns = headerCells.map((cell) => COLUMN_ALIASES[cell] ?? COLUMN_ALIASES[stripAccents(cell)])

  if (!columns.includes('name') || !columns.includes('price')) {
    return {
      rows: [],
      errors: [{ row: 0, message: 'Cabeçalho deve conter ao menos as colunas "nome" e "preço"' }],
    }
  }

  const rows: ParsedProductRow[] = []

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1
    const cells = splitCsvLine(lines[index]!)
    const record: Record<string, string> = {}
    columns.forEach((column, columnIndex) => {
      if (column) record[column] = cells[columnIndex] ?? ''
    })

    const name = record['name']?.trim()
    if (!name) {
      errors.push({ row: rowNumber, message: 'Nome é obrigatório' })
      continue
    }

    const priceRaw = record['price']?.trim().replace(',', '.')
    const price = priceRaw ? Number(priceRaw) : NaN
    if (!priceRaw || Number.isNaN(price) || price <= 0) {
      errors.push({ row: rowNumber, message: `Preço inválido: "${record['price'] ?? ''}"` })
      continue
    }

    rows.push({
      row: rowNumber,
      name,
      price,
      ...(record['description'] && { description: record['description'] }),
      ...(record['unit'] && { unit: record['unit'] }),
      ...(record['barcode'] && { barcode: record['barcode'] }),
      ...(record['catalogName'] && { catalogName: record['catalogName'] }),
    })
  }

  return { rows, errors }
}

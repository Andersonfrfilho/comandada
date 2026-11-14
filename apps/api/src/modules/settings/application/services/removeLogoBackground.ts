import sharp from 'sharp'

// Fundo liso do logo (preto, branco, laranja...) vira transparente: o logo aparece igual na figurinha,
// no login, no menu e no rodapé, sobre qualquer cor. Só age quando a borda da imagem é de uma cor só;
// foto ou logo já transparente passam como estão.
export const LOGO_BACKGROUND = {
  // Diferença máxima por canal (0-255) para um pixel contar como fundo. Baixa de propósito: detalhe
  // escuro encostado no fundo preto (o portal do Yuyaki) não pode sumir junto.
  tolerance: 16,
  // Fração mínima da borda com a mesma cor para tratar como fundo liso.
  uniformBorderRatio: 0.9,
  // Pixel com alpha abaixo disto já é transparente.
  transparentAlpha: 16,
} as const

type Rgb = [number, number, number]

/** Devolve PNG com o fundo removido e as sobras de borda cortadas, ou a imagem original em PNG se não houver fundo liso. */
export async function removeLogoBackground(image: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const borderIndexes = borderPixelIndexes(width, height)
  const opaqueBorder = borderIndexes.filter((index) => (data[index * 4 + 3] ?? 0) >= LOGO_BACKGROUND.transparentAlpha)
  if (opaqueBorder.length < borderIndexes.length * LOGO_BACKGROUND.uniformBorderRatio) return toPng(image)

  const background = medianColor(data, opaqueBorder)
  const isBackground = (index: number): boolean => colorDistance(data, index * 4, background) <= LOGO_BACKGROUND.tolerance
  const matchingBorder = opaqueBorder.filter(isBackground).length
  if (matchingBorder < borderIndexes.length * LOGO_BACKGROUND.uniformBorderRatio) return toPng(image)

  // Só some o fundo ligado à borda: a mesma cor dentro do desenho (olho, letra vazada) fica.
  const visited = new Uint8Array(width * height)
  const pending: number[] = [...borderIndexes]
  while (pending.length > 0) {
    const index = pending.pop() as number
    if (visited[index] || !isBackground(index)) continue
    visited[index] = 1
    data[index * 4 + 3] = 0
    const column = index % width
    if (column > 0) pending.push(index - 1)
    if (column < width - 1) pending.push(index + 1)
    if (index >= width) pending.push(index - width)
    if (index < width * (height - 1)) pending.push(index + width)
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).trim().png().toBuffer()
}

function borderPixelIndexes(width: number, height: number): number[] {
  const indexes: number[] = []
  for (let column = 0; column < width; column++) indexes.push(column, (height - 1) * width + column)
  for (let row = 1; row < height - 1; row++) indexes.push(row * width, row * width + width - 1)
  return indexes
}

function medianColor(data: Buffer, indexes: number[]): Rgb {
  const channel = (offset: number): number => {
    const values = indexes.map((index) => data[index * 4 + offset] ?? 0).sort((first, second) => first - second)
    return values[values.length >> 1] ?? 0
  }
  return [channel(0), channel(1), channel(2)]
}

function colorDistance(data: Buffer, offset: number, color: Rgb): number {
  return Math.max(
    Math.abs((data[offset] ?? 0) - color[0]),
    Math.abs((data[offset + 1] ?? 0) - color[1]),
    Math.abs((data[offset + 2] ?? 0) - color[2])
  )
}

function toPng(image: Buffer): Promise<Buffer> {
  return sharp(image).png().toBuffer()
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i

/** Logo salvo como data URL (Configurações → Marca) → data URL PNG sem fundo. Outro formato volta igual. */
export async function removeLogoBackgroundFromDataUrl(logo: string): Promise<string> {
  const match = DATA_URL_PATTERN.exec(logo.trim())
  if (!match?.[1]) return logo
  const png = await removeLogoBackground(Buffer.from(match[1], 'base64'))
  return `data:image/png;base64,${png.toString('base64')}`
}

export interface ParsedMultipartFile {
  fieldName: string
  fileName: string
  contentType: string
  buffer: Buffer
}

export interface ParsedMultipart {
  fields: Record<string, string>
  files: ParsedMultipartFile[]
}

function extractBoundary(contentType: string): string {
  const match = contentType.match(/boundary=(.+)/i)
  if (!match || !match[1]) {
    throw new Error('Missing boundary in multipart Content-Type')
  }
  return match[1].trim()
}

function extractHeaderValue(part: string, headerName: string): string {
  const regex = new RegExp(`${headerName}:\\s*(.+?)\\r?\\n`, 'i')
  const match = part.match(regex)
  return match?.[1]?.trim() ?? ''
}

function extractContentDispositionValue(header: string, key: string): string {
  const regex = new RegExp(`${key}="([^"]*)"`, 'i')
  const match = header.match(regex)
  return match?.[1]?.trim() ?? ''
}

const CRLF = '\r\n'
const DOUBLE_CRLF = '\r\n\r\n'

export function parseMultipart(rawBody: Buffer, contentType: string): ParsedMultipart {
  const boundary = extractBoundary(contentType)
  const boundaryDelimiter = `--${boundary}`
  const boundaryBuffer = Buffer.from(boundaryDelimiter)
  const endBoundaryBuffer = Buffer.from(`${boundaryDelimiter}--`)

  const fields: Record<string, string> = {}
  const files: ParsedMultipartFile[] = []

  let offset = 0

  while (offset < rawBody.length) {
    const boundaryIndex = rawBody.indexOf(boundaryBuffer, offset)
    if (boundaryIndex === -1) break

    const nextBoundaryIndex =
      rawBody.indexOf(`${CRLF}${boundaryDelimiter}`, boundaryIndex) !== -1
        ? rawBody.indexOf(`${CRLF}${boundaryDelimiter}`, boundaryIndex)
        : rawBody.indexOf(`${DOUBLE_CRLF}${boundaryDelimiter}`, boundaryIndex)

    if (nextBoundaryIndex !== -1) {
      const startContent = rawBody.indexOf(DOUBLE_CRLF, boundaryIndex)
      if (startContent === -1) break

      const headerEnd = startContent + 4
      const contentEnd = rawBody.lastIndexOf(CRLF, nextBoundaryIndex)
      const partEnd = contentEnd > headerEnd ? contentEnd : nextBoundaryIndex

      const headers = rawBody.subarray(boundaryIndex, headerEnd).toString('utf-8')
      const body = rawBody.subarray(headerEnd, partEnd)

      const contentDisposition = extractHeaderValue(headers, 'Content-Disposition')
      const fieldName = extractContentDispositionValue(contentDisposition, 'name')
      const fileName = extractContentDispositionValue(contentDisposition, 'filename')

      if (fileName) {
        const fileContentType =
          extractHeaderValue(headers, 'Content-Type') || 'application/octet-stream'
        files.push({
          fieldName,
          fileName,
          contentType: fileContentType,
          buffer: Buffer.from(body),
        })
      } else if (fieldName) {
        fields[fieldName] = body.toString('utf-8').trim()
      }

      // Check if this is the last boundary
      if (rawBody.subarray(partEnd, partEnd + endBoundaryBuffer.length).equals(endBoundaryBuffer)) {
        break
      }

      offset = partEnd + CRLF.length
    } else {
      // Last part
      const startContent = rawBody.indexOf(DOUBLE_CRLF, boundaryIndex)
      if (startContent === -1) break

      const headerEnd = startContent + 4
      const contentEnd = rawBody.lastIndexOf(`${CRLF}${boundaryDelimiter}--`, rawBody.length)
      const partEnd = contentEnd > headerEnd ? contentEnd : rawBody.length

      const headers = rawBody.subarray(boundaryIndex, headerEnd).toString('utf-8')
      const body = rawBody.subarray(headerEnd, partEnd)

      const contentDisposition = extractHeaderValue(headers, 'Content-Disposition')
      const fieldName = extractContentDispositionValue(contentDisposition, 'name')
      const fileName = extractContentDispositionValue(contentDisposition, 'filename')

      if (fileName) {
        const fileContentType =
          extractHeaderValue(headers, 'Content-Type') || 'application/octet-stream'
        files.push({
          fieldName,
          fileName,
          contentType: fileContentType,
          buffer: Buffer.from(body),
        })
      } else if (fieldName) {
        fields[fieldName] = body.toString('utf-8').trim()
      }

      break
    }
  }

  return { fields, files }
}

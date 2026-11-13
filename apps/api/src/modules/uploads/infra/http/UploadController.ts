import type { RouteHandler } from '@/infra/http/router'
import type { UploadFileUseCase } from '../../application/UploadFileUseCase'
import { parseMultipart } from '@/shared/utils/parseMultipart'
import { ValidationError } from '@/shared/errors/AppError'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export class UploadController {
  constructor(private readonly uploadFileUseCase: UploadFileUseCase) {}

  upload: RouteHandler = async (request, response) => {
    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError('Content-Type must be multipart/form-data')
    }

    const parsed = parseMultipart(request.rawBody, contentType)

    const uploadedFile = parsed.files[0]
    if (!uploadedFile) {
      throw new ValidationError('No file provided in field "file"')
    }

    if (!ALLOWED_MIME_TYPES.includes(uploadedFile.contentType)) {
      throw new ValidationError(
        `Unsupported file type: ${uploadedFile.contentType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
      )
    }

    if (uploadedFile.buffer.length > MAX_FILE_SIZE) {
      throw new ValidationError('File size exceeds 10 MB limit')
    }

    const result = await this.uploadFileUseCase.execute({
      buffer: uploadedFile.buffer,
      originalName: uploadedFile.fileName,
      contentType: uploadedFile.contentType,
    })

    response.json(result, 201)
  }
}

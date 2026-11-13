import { randomUUID } from 'crypto'
import { extname } from 'path'
import type { StorageProvider } from '@/shared/providers/StorageProvider'
import { mediaQueue } from '@/infra/queue/mediaQueue'
import { MEDIA_PROCESSING_JOB } from '@/infra/queue/QueueNames.constant'

interface UploadFileInput {
  buffer: Buffer
  originalName: string
  contentType: string
}

interface UploadFileOutput {
  url: string
  key: string
}

export class UploadFileUseCase {
  constructor(private readonly storageProvider: StorageProvider) {}

  async execute(input: UploadFileInput): Promise<UploadFileOutput> {
    const extension = extname(input.originalName) || '.bin'
    const key = `${randomUUID()}${extension}`

    const url = await this.storageProvider.upload(key, input.buffer, input.contentType)

    await mediaQueue.add(MEDIA_PROCESSING_JOB.RESIZE_IMAGE, {
      type: MEDIA_PROCESSING_JOB.RESIZE_IMAGE,
      key,
    })

    await mediaQueue.add(MEDIA_PROCESSING_JOB.OPTIMIZE, {
      type: MEDIA_PROCESSING_JOB.OPTIMIZE,
      key,
    })

    return { url, key }
  }
}

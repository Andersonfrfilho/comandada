import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { Worker, type ConnectionOptions } from 'bullmq'
import { queueConnection } from '@/infra/queue/redisConnection'
import {
  MEDIA_PROCESSING_QUEUE,
  MEDIA_PROCESSING_JOB,
  type MediaProcessingJobData,
} from '@/infra/queue/QueueNames.constant'

const UPLOAD_DIR = '/tmp/uploads'

function resolvePath(key: string): string {
  const sanitized = key.replace(/\.\.\/|\.\.\\/g, '').replace(/[^\w.\-/]/g, '')
  return join(UPLOAD_DIR, sanitized)
}

async function resizeImage(key: string): Promise<void> {
  const sourcePath = resolvePath(key)
  const thumbKey = key.replace(/(\.[^.]+)$/, '_thumb$1')
  const thumbPath = resolvePath(thumbKey)

  const sourceBuffer = readFileSync(sourcePath)

  try {
    const sharp = (await import('sharp')).default
    const resized = await sharp(sourceBuffer)
      .resize({ width: 200, withoutEnlargement: true })
      .toBuffer()
    mkdirSync(dirname(thumbPath), { recursive: true })
    writeFileSync(thumbPath, resized)
  } catch {
    mkdirSync(dirname(thumbPath), { recursive: true })
    writeFileSync(thumbPath, sourceBuffer)
  }
}

async function optimizeImage(key: string): Promise<void> {
  const sourcePath = resolvePath(key)
  const sourceBuffer = readFileSync(sourcePath)

  try {
    const sharp = (await import('sharp')).default
    const optimized = await sharp(sourceBuffer)
      .jpeg({ quality: 85 })
      .toBuffer()
    writeFileSync(sourcePath, optimized)
  } catch {
    // sharp not available — pass-through
  }
}

export function startMediaWorker(): Worker {
  const worker = new Worker<MediaProcessingJobData>(
    MEDIA_PROCESSING_QUEUE,
    async (job) => {
      if (job.name === MEDIA_PROCESSING_JOB.RESIZE_IMAGE) {
        await resizeImage(job.data.key)
        return
      }
      if (job.name === MEDIA_PROCESSING_JOB.OPTIMIZE) {
        await optimizeImage(job.data.key)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 2 }
  )

  worker.on('failed', (job, err) => {
    console.error('[MediaProcessor] job failed', job?.id, err?.message)
  })

  worker.on('error', (err) => console.error('[MediaProcessor] error', err.message))

  return worker
}

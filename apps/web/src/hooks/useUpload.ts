import { useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { API_URL } from '@/lib/apiEndpoints'


interface UploadResult {
  url: string
  key: string
}

interface UseUploadReturn {
  upload: (file: File) => Promise<UploadResult>
  uploading: boolean
  error: string | null
}

export function useUpload(): UseUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accessToken = useAuthStore((state) => state.accessToken)

  const upload = useCallback(
    async (file: File): Promise<UploadResult> => {
      setUploading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`${API_URL}/uploads`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { message?: string }
            | undefined
          throw new Error(body?.message ?? `Upload failed with status ${response.status}`)
        }

        const result = (await response.json()) as UploadResult
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        setError(message)
        throw err
      } finally {
        setUploading(false)
      }
    },
    [accessToken]
  )

  return { upload, uploading, error }
}

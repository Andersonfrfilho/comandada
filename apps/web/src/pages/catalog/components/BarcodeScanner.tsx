import { useRef, useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

const BARCODE_FORMATS = ['ean_13', 'ean_8'] as const

declare class BarcodeDetector {
  constructor(options: { formats: readonly string[] })
  detect(image: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const scanningRef = useRef(false)
  const animationRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [manualInput, setManualInput] = useState('')
  const [showFallback, setShowFallback] = useState(false)

  const stopCamera = useCallback(() => {
    scanningRef.current = false
    cancelAnimationFrame(animationRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const scan = useCallback(() => {
    if (!scanningRef.current) return
    const video = videoRef.current
    const detector = detectorRef.current
    if (video && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && detector) {
      detector
        .detect(video)
        .then((barcodes) => {
          if (barcodes.length > 0) {
            stopCamera()
            onScan(barcodes[0].rawValue)
            return
          }
          if (scanningRef.current) {
            animationRef.current = requestAnimationFrame(scan)
          }
        })
        .catch(() => {
          if (scanningRef.current) {
            animationRef.current = requestAnimationFrame(scan)
          }
        })
    } else if (scanningRef.current) {
      animationRef.current = requestAnimationFrame(scan)
    }
  }, [onScan, stopCamera])

  const startScanning = useCallback(() => {
    scanningRef.current = true
    animationRef.current = requestAnimationFrame(scan)
  }, [scan])

  useEffect(() => {
    let detector: BarcodeDetector | null = null
    try {
      detector = new BarcodeDetector({ formats: BARCODE_FORMATS })
    } catch {
      setShowFallback(true)
      return
    }
    detectorRef.current = detector

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        if (!cancelled) setShowFallback(true)
      })

    cleanupRef.current = () => {
      cancelled = true
      stopCamera()
    }

    return () => {
      cleanupRef.current?.()
    }
  }, [stopCamera])

  function handleManualSubmit() {
    if (!manualInput.trim()) return
    onScan(manualInput)
    onClose()
  }

  function handleClose() {
    stopCamera()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Escanear código de barras</h3>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showFallback ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Leitor não disponível. Digite o código manualmente.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras</label>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Ex: 7891234567890"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
                className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                onCanPlay={startScanning}
                className="w-full h-64 object-cover"
              />
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Posicione o código de barras na frente da câmera
            </p>
          </>
        )}
      </div>
    </div>
  )
}

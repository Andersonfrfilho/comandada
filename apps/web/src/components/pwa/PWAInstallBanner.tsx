import { useEffect } from 'react'
import { usePWAStore, type BeforeInstallPromptEvent } from '@/stores/pwaStore'
import { useBrandingStore } from '@/stores/brandingStore'

export function PWAInstallBanner() {
  const { installPrompt, isInstalled, setInstallPrompt, setInstalled } = usePWAStore()
  const brandName = useBrandingStore((state) => state.branding.name)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setInstalled(true)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [setInstallPrompt, setInstalled])

  if (isInstalled || !installPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-gray-900 text-white rounded-xl shadow-2xl p-4 z-50">
      <p className="text-sm font-medium mb-3">Instale o {brandName} para acesso rápido</p>
      <div className="flex gap-2">
        <button
          onClick={() => installPrompt.prompt()}
          className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-medium transition-colors active:scale-95"
        >
          Instalar
        </button>
        <button
          onClick={() => setInstallPrompt(null)}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors active:scale-95"
        >
          Depois
        </button>
      </div>
    </div>
  )
}

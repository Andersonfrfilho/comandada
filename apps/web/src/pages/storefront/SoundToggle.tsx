import { Volume2, VolumeX } from 'lucide-react'
import { useStorefrontSound } from './storefrontSound'

/** Liga e desliga o som do cardápio e do acompanhamento ("Yo!" do pedido enviado, "Yooo!" do pedido andando). */
export function SoundToggle({ className = '' }: { className?: string }) {
  const { enabled, toggle } = useStorefrontSound()
  const Icon = enabled ? Volume2 : VolumeX
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!enabled}
      aria-label={enabled ? 'Desligar som' : 'Ligar som'}
      title={enabled ? 'Desligar som' : 'Ligar som'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30 active:scale-95 ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

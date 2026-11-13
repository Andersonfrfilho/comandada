import { useBrandingStore } from '@/stores/brandingStore'
import { initialsOfBrand } from '@/lib/branding'

interface BrandIdentityProps {
  size?: 'small' | 'large'
  tone?: 'light' | 'dark'
  // stacked: logo em cima e nome embaixo, centralizados (tela de login).
  layout?: 'inline' | 'stacked'
}

// Logo e nome do restaurante. Sem logo cadastrado, mostra as iniciais na cor principal.
export function BrandIdentity({ size = 'small', tone = 'light', layout = 'inline' }: BrandIdentityProps) {
  const branding = useBrandingStore((state) => state.branding)
  const markSize = size === 'large' ? 'h-20 w-20 text-2xl' : 'h-9 w-9 text-sm'
  const nameClass = size === 'large' ? 'text-2xl' : 'text-base'
  const nameColor = tone === 'light' ? 'text-white' : 'text-gray-900'
  const containerClass = layout === 'stacked'
    ? 'flex flex-col items-center gap-3 text-center min-w-0'
    : 'flex items-center gap-3 min-w-0'

  return (
    <div className={containerClass}>
      {branding.logo ? (
        <img
          src={branding.logo}
          alt={`Logo ${branding.name}`}
          className={`${markSize} rounded-2xl object-cover flex-shrink-0`}
        />
      ) : (
        <span
          className={`${markSize} rounded-2xl bg-brand-600 text-white font-bold flex items-center justify-center flex-shrink-0`}
          aria-hidden="true"
        >
          {initialsOfBrand(branding.name)}
        </span>
      )}
      <span className={`${nameClass} ${nameColor} font-bold leading-tight truncate max-w-full`}>{branding.name}</span>
    </div>
  )
}

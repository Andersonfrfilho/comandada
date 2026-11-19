import { useBrandingStore } from '@/stores/brandingStore'
import { ADA_MARK_SOURCE, ADA_WEBSITE_URL, DEFAULT_BRANDING, PLATFORM_NAME } from '@/constants/branding'

// Rodapé de todas as telas. Marca branca: o copyright é do restaurante e a Ada assina a
// plataforma na segunda linha. Sem marca própria, o copyright é da Ada. O cardápio online passa o
// nome do restaurante (`brandName`), porque lá não há login que carregue a marca.
export function AppFooter({
  className = '',
  brandName: brandNameOverride,
  textClassName = 'text-gray-400',
}: {
  className?: string
  brandName?: string
  textClassName?: string
}) {
  const storedBrandName = useBrandingStore((state) => state.branding.name)
  const brandName = brandNameOverride ?? storedBrandName
  const year = new Date().getFullYear()
  const isWhiteLabel = brandName !== DEFAULT_BRANDING.name
  const adaLink = (
    <a href={ADA_WEBSITE_URL} target="_blank" rel="noreferrer" className="font-medium hover:text-gray-600 underline-offset-2 hover:underline">
      Ada Technology
    </a>
  )

  return (
    <footer className={`flex flex-col sm:flex-row items-center justify-center gap-2 px-4 py-4 text-xs ${textClassName} ${className}`}>
      <img alt="" aria-hidden="true" src={ADA_MARK_SOURCE} className="h-6 w-auto opacity-70" />
      <div className="text-center leading-relaxed">
        {isWhiteLabel ? (
          <>
            <p>© {year} {brandName}. Todos os direitos reservados.</p>
            <p>Plataforma {PLATFORM_NAME} — uma solução {adaLink}</p>
          </>
        ) : (
          <p>© {year} {adaLink} — {PLATFORM_NAME}. Todos os direitos reservados.</p>
        )}
      </div>
    </footer>
  )
}

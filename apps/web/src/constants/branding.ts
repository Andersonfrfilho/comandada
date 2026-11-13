// Marca padrão do painel, usada quando o restaurante ainda não tem a sua (ou o domínio não é de
// nenhum restaurante). A marca de cada restaurante vem das Configurações, nunca deste arquivo.
export const DEFAULT_BRANDING = {
  name: 'ComandAdA',
  logo: '/brand/comandada-mark.svg',
  primaryColor: '#0E7C66',
} as const

export const BRANDING_SETTING_KEYS = {
  name: 'brand_name',
  logo: 'brand_logo',
  primaryColor: 'brand_primary_color',
  domains: 'brand_domains',
} as const

export const BRAND_LOGO_MAX_SIZE = 360

// Atribuição da Ada Technology no rodapé (padrão Ada: ano do relógio, link com rel="noreferrer").
export const PLATFORM_NAME = 'ComandAdA'
export const ADA_WEBSITE_URL = 'https://adatechnology.com.br'
export const ADA_MARK_SOURCE = '/icons/ada-technology.png'

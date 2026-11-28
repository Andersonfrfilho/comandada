import '@adatechnology/coupons-ui/styles.css'
import { CampaignsWorkspace, CouponsProvider } from '@adatechnology/coupons-ui'

import { RecipesSelectField } from '@/components/recipes/RecipesSelectField'
import { couponsSdkApi } from '@/lib/couponsSdkApi'

const RESTAURANT_TIME_ZONE = 'America/Sao_Paulo'

// A captação de contatos (LeadCaptureDialog) fica desligada: depende de texto de consentimento e uso dos dados.
export function CampaignsPage() {
  return (
    <div className="p-4 lg:p-6">
      <CouponsProvider
        adminApi={couponsSdkApi}
        locale="pt-BR"
        timeZone={RESTAURANT_TIME_ZONE}
        renderSelect={RecipesSelectField}
      >
        <CampaignsWorkspace />
      </CouponsProvider>
    </div>
  )
}

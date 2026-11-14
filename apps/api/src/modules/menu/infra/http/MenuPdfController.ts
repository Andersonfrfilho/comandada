import type { RouteHandler } from '@/infra/http/router'
import { NotFoundError } from '@/shared/errors/AppError'
import type { MenuPdfService } from '../../application/services/MenuPdfService'
import { MENU_PDF } from '../../shared/menuPdf.constant'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class MenuPdfController {
  constructor(private readonly menuPdfService: Pick<MenuPdfService, 'forEstablishment'>) {}

  // "📄 Ver cardápio completo" do bot. Pública porque a Meta baixa o documento pela URL.
  getMenuPdf: RouteHandler = async (request, response) => {
    const establishmentId = request.params['establishmentId'] ?? ''
    if (!UUID_PATTERN.test(establishmentId)) throw new NotFoundError('Cardápio')
    const menu = await this.menuPdfService.forEstablishment(establishmentId)
    if (!menu) throw new NotFoundError('Cardápio')
    response.binary(menu.pdf, MENU_PDF.contentType, MENU_PDF.fileName)
  }
}

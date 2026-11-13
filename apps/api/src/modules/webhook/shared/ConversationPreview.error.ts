import { AppError } from '@/shared/errors/AppError'
import { PREVIEW_DISABLED_MESSAGE } from './ConversationPreview.constant'

/**
 * 403 e não 404: a rota existe, o que falta é a habilitação do ambiente. Devolver "não encontrado"
 * mandaria quem opera procurar erro de digitação na URL.
 */
export class ConversationPreviewDisabledError extends AppError {
  constructor() {
    super(PREVIEW_DISABLED_MESSAGE, 'conversation_preview_disabled', 403)
    this.name = 'ConversationPreviewDisabledError'
  }
}

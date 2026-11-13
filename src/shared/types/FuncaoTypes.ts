// Tipagens de parâmetros e resultados das funções helper

interface CartSummarioParams {
  items: CartItem[];
}

interface CartSummarioResult {
  lines: string[];
  total: number;
}

interface ValidarNomeParams {
  raw: string;
}

interface ValidarNomeResult {
  valid: boolean;
  reason?: 'short' | 'numbers' | 'invalid_chars' | 'repeated' | 'bad_word';
}

interface ParseTrocoParams {
  texto: string;
  amountToPay: number;
}

interface ConstruirLinhasPedidoParams {
  lastOrder: { items: OrderItem[]; total: number };
  products: any[];
  header: string;
}

interface CalcTaxaEntregaParams {
  km: number;
  min: number;
  subtotal: number;
}

interface N8nResponsePayload {
  tel: string;
  instancia: string;
  respostas: OutgoingMessage[];
  state: string;
  cart: Cart;
  reservation_temp: ReservationTemp;
  save_order: boolean;
  order: Order | null;
  save_reservation: boolean;
  reservation: Reservation | null;
  save_customer_name: boolean;
  customer_name_to_save: string | null;
  save_marketing_opt_in: boolean;
  marketing_opt_in_value: boolean | null;
  kitchen_phone: string;
  request_human_handoff: boolean;
  handoff_customer_name: string;
  save_issue: boolean;
  issue: CustomerIssue | null;
  save_partial_answer: boolean;
  partial_answer: PartialConfirmationAnswer | null;
}

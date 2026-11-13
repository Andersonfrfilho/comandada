// Interfaces para objetos de domínio vindos do banco/n8n

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji?: string;
  description?: string;
  variant_group?: string | null;
  variant_label?: string | null;
}

interface PaymentType {
  name: string;
  label: string;
  config?: Record<string, string>;
}

interface PixConfig {
  chave: string;
  nome: string;
}

interface OrderType {
  name: string;
  label: string;
  active?: boolean;
}

interface FeeZone {
  type: 'km' | 'min';
  min: number;
  max: number;
  fee: number;
}

interface DeliveryFeeRule {
  mode: string;
  base_fee?: number;
  per_km_rate?: number;
  per_min_rate?: number;
  free_above?: number;
  max_radius_km?: number;
  zones?: FeeZone[];
}

interface RecentOrder {
  code: string;
  status: string;
  order_type: string;
  total: number;
  created_at: string;
  estimated_at?: string | null;
  scheduled_for?: string | null;
  completed_at?: string | null;
  payment_method?: string;
  items_count?: number;
}

interface LastOrder {
  code?: string;
  items: OrderItem[];
  total: number;
  status?: string;
}

interface RestaurantTable {
  id: string;
  number: string | number;
  capacity: number;
}

interface UpcomingReservation {
  date: string;
  time: string;
  table_id: string;
}

interface CepResponse {
  erro?: boolean;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface NominatimReverseResult {
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state_code?: string;
    state?: string;
  };
}

interface OsrmRoute {
  distance: number;
  duration: number;
}

interface OsrmResponse {
  routes?: OsrmRoute[];
}

interface EstablishmentConfig {
  id: string;
  slug: string;
  whatsapp_number: string;
  name: string;
  phone: string | null;
  logo_url: string | null;
  address: string | null;
  lat: number;
  lng: number;
  city: string | null;
  opening_time: string;
  closing_time: string;
  working_days: string;
  msg_welcome: string;
  msg_closed: string;
  min_order_value: number;
  prep_time_min: number;
  session_ttl_min: number;
  ignore_hours: boolean;
  feature_delivery: boolean;
  feature_retirada: boolean;
  feature_reservas: boolean;
  feature_pedido_mesa: boolean;
  kitchen_phone: string | null;
  agent_phone: string | null;
  reminder_interval_days: number;
  reminder_min_gap_days: number;
  reminder_send_hour: number;
  reminder_message_template: string | null;
  reservation_reminder_hour: number;
  active: boolean;
}

interface N8nInputData {
  establishment: EstablishmentConfig;
  config: Record<string, string>;
  products: Product[];
  recent_orders: RecentOrder[];
  session: SessionRaw;
  last_order: LastOrder | null;
  payment_types: PaymentType[];
  order_types: OrderType[];
  customer_name: string | null;
  marketing_opt_in: boolean | null;
  delivery_fee_rule: DeliveryFeeRule;
  restaurant_tables: RestaurantTable[];
  upcoming_reservations: UpcomingReservation[];
  schedule_slots?: ScheduleDay[];
  conversation?: ConversationInfo;
  partial_confirmation?: PartialConfirmation | null;
}

// A equipe avisou que itens acabaram e espera o SIM (segue sem eles) ou NÃO (cancela) do cliente.
interface PartialConfirmation {
  order_code: string;
  unavailable: string[];
  new_total: number;
}

interface PartialConfirmationAnswer {
  order_code: string;
  accept: boolean;
}

// Conversa na inbox do painel: 'human' = atendente assumiu; human_requested = pedido sem atendente ainda.
interface ConversationInfo {
  mode: 'bot' | 'human';
  human_requested: boolean;
}

interface ScheduleDay {
  date: string;
  times: string[];
}

interface MsgData {
  tel: string;
  instancia: string;
  texto: string;
  // Mesmo texto sem passar para minúsculas (observações e relatos do cliente).
  texto_original?: string;
  horaAtual: string;
  diaSemana: string;
  location_lat: number | null;
  location_lng: number | null;
  push_name?: string;
}

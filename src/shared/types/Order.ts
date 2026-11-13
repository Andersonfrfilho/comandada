interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
  note?: string;
}

interface Order {
  tel: string;
  customer_name: string | null;
  code: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  order_type: string;
  address: string;
  maps_link: string;
  payment_method: string;
  change_for: number | null;
  split_count?: number;
  split_payments?: SplitPayment[];
  // Cada parte do pagamento como o cliente escolheu; é o que o painel mostra (troco, divisão, misto).
  payments: OrderPaymentLeg[];
  // Encomenda: instante ISO com fuso (-03:00); null = para agora.
  scheduled_for?: string | null;
}

interface OrderPaymentLeg {
  method: string;
  amount: number;
  change_for: number | null;
  split_label: string | null;
}

interface CustomerIssue {
  order_code: string | null;
  category: string;
  description: string | null;
}

interface Reservation {
  tel: string;
  code: string;
  customer_name: string | null;
  date: string;
  time: string;
  party_size: number;
}

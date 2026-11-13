interface CartItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
  // Observação do cliente para a cozinha (ex: "sem cebola").
  note?: string;
}

interface SplitPayment {
  person: number;
  method?: string;
  label: string;
  change_for: number | null;
}

interface Cart {
  items: CartItem[];
  order_type: string;
  address: string;
  complement?: string;
  delivery_fee: number;
  payment_method: string;
  change_for: number | null;
  split_count: number;
  split_current: number;
  split_payments: SplitPayment[];
  mixed_method: string;
  mixed_label: string;
  mixed_amount: number;
  address_street_temp: string | null;
  browse_category: string;
  browse_page?: number;
  pending_item_id: string | null;
  pending_item_name: string;
  pending_group: string;
  // Último item adicionado: é a ele que a observação se aplica.
  last_item_id?: string | null;
  // Encomenda: data (YYYY-MM-DD) e hora (HH:mm) locais escolhidas; vazio = para agora.
  scheduled_date: string;
  scheduled_time: string;
  // Problema relatado pelo cliente, montado em três mensagens (pedido → tipo → detalhe).
  issue_order_code?: string;
  issue_category?: string;
}

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
  browse_cat_page?: number;
  // Evolution: número digitado → id da opção da última lista/botões enviada.
  menu_choices?: Record<string, string>;
  pending_item_id: string | null;
  pending_item_name: string;
  // Observação escrita na escolha do item, antes da quantidade: entra junto com ele no carrinho.
  pending_item_note?: string;
  // Editar carrinho: posição (em items) da linha que o cliente escolheu mudar.
  edit_index?: number | null;
  // Observação do pedido inteiro, perguntada uma vez antes do pagamento.
  order_note?: string;
  order_note_asked?: boolean;
  pending_group: string;
  // Último item adicionado: é a ele que a observação se aplica.
  last_item_id?: string | null;
  // Encomenda: data (YYYY-MM-DD) e hora (HH:mm) locais escolhidas; vazio = para agora.
  scheduled_date: string;
  scheduled_time: string;
  // Agendamento aberto pelo menu principal: o "Voltar" dos dias volta para ele, não para as categorias.
  schedule_from_menu?: boolean;
  // Problema relatado pelo cliente, montado em três mensagens (pedido → tipo → detalhe).
  issue_order_code?: string;
  issue_category?: string;
  // Pedido escrito ou falado ("2 combo tradicional e 1 hot roll") esperando escolha ou confirmação.
  text_order?: TextOrderDraft | null;
  // Troca de item em falta: o que o cliente já escolheu (item → produto ou null) e qual item está na vez.
  partial_picks?: Record<string, string | null> | null;
  partial_pick_index?: number | null;
}

// Item do texto que bateu com mais de um produto: o cliente escolhe numa lista.
interface TextOrderChoice {
  query: string;
  qty: number;
  option_ids: string[];
}

interface TextOrderDraft {
  items: CartItem[];
  pending: TextOrderChoice[];
  unrecognized: string[];
}

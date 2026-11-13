interface ReservationTemp {
  date?: string;
  time?: string;
  party_size?: number;
  table_id?: string;
  table_number?: string | number;
}

interface SessionRaw {
  state?: string;
  cart?: Partial<Cart> | CartItem[];
  last_activity_at?: string;
  reservation_temp?: ReservationTemp;
}

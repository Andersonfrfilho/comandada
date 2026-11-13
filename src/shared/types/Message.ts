interface ButtonMessage {
  type: 'buttons';
  body: string;
  buttons: Array<{ id: string; title: string }>;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface ListMessage {
  type: 'list';
  body: string;
  button: string;
  sections: Array<{ title: string; rows: ListRow[] }>;
}

interface TextMenuMessage {
  type: 'text_menu';
  body: string;
  items: Array<{ num: number; id: string; name: string }>;
  categoryName: string;
  context: string;
  page: number;
  hasMore: boolean;
}

interface LocationMessage {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

type OutgoingMessage =
  | string
  | ButtonMessage
  | ListMessage
  | TextMenuMessage
  | LocationMessage;

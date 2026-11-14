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

// Menu já desenhado como texto (Evolution): choices leva o número digitado ao id da opção.
interface TextMenuMessage {
  type: 'text_menu';
  body: string;
  choices: Record<string, string>;
}

interface LocationMessage {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

interface StickerMessage {
  type: 'sticker';
  link: string;
}

// Arquivo (PDF do cardápio): a Meta baixa pelo link.
interface DocumentMessage {
  type: 'document';
  link: string;
  filename: string;
  caption?: string;
}

type OutgoingMessage =
  | string
  | ButtonMessage
  | ListMessage
  | TextMenuMessage
  | LocationMessage
  | StickerMessage
  | DocumentMessage;

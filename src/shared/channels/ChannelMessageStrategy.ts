// ── Mensagens por provedor de WhatsApp (Strategy) ────────────────────────────
// Ponto único que decide o formato de TUDO que o bot manda. Os handlers montam mensagens
// neutras (lista, botões, ou um MenuPage paginado do cardápio) e, antes de sair, a resposta
// inteira passa pela estratégia do provedor:
//   - meta_cloud (WhatsApp oficial): lista interativa e botões, com os limites da Meta
//     aplicados aqui (10 linhas, título 24, descrição 72, botão 20). Nunca texto numerado.
//   - evolution: lista e botões viram texto numerado em negrito; o número digitado é
//     traduzido de volta para o id da opção na mensagem seguinte (cart.menu_choices).
// Nos passos em que o cliente digita um número de verdade (quantidade, troco, nº da casa)
// as opções saem sem número no Evolution, para "2" continuar significando 2.

const WHATSAPP_LIST_MAX_ROWS = 10;
const WHATSAPP_ROW_TITLE_MAX = 24;
const WHATSAPP_ROW_DESCRIPTION_MAX = 72;
// Descrição dos itens no cardápio: a linha da lista da Meta e a linha em texto da Evolution.
const MENU_ROW_DESCRIPTION_MAX = WHATSAPP_ROW_DESCRIPTION_MAX;
const MENU_TEXT_DESCRIPTION_MAX = 70;
const WHATSAPP_LIST_BUTTON_MAX = 20;
const WHATSAPP_BUTTON_TITLE_MAX = 20;
const WHATSAPP_MAX_BUTTONS = 3;
const WHATSAPP_ROW_ID_MAX = 200;

// Opções por página: 8 + "Ver mais" + "Voltar" = 10 linhas (limite da Meta).
const MENU_PAGE_SIZE = WHATSAPP_LIST_MAX_ROWS - 2;

const WhatsAppProvider = {
  META_CLOUD: 'meta_cloud',
  EVOLUTION: 'evolution',
} as const;

interface MenuOption {
  id: string;            // id da opção (o handler recebe isto)
  number: number;        // número mostrado no texto
  emoji: string;
  title: string;
  price?: string;        // "R$ 95,00" ou "Médio R$ 37,00 · Grande R$ 49,00"
  description?: string;
}

interface MenuPage {
  heading: string;       // título em negrito, já com emoji
  subtitle: string;      // linha de apoio ("Escolha um item 👇")
  button: string;        // rótulo do botão que abre a lista
  sectionTitle: string;
  options: MenuOption[]; // só as opções desta página
  page: number;
  totalPages: number;
  hasMore: boolean;
  nextId: string;        // texto/id que avança a página
  backId: string;        // texto/id que volta
  backLabel: string;
  checkout?: MenuCheckout; // com carrinho: atalho para fechar o pedido
}

interface MenuCheckout {
  id: string;
  title: string;
  description: string;
}

interface ChannelRenderResult {
  messages: OutgoingMessage[];
  choices: Record<string, string>;   // número digitado → id da opção (só Evolution)
}

interface ChannelMessageStrategy {
  // Cardápio paginado (categorias e itens), com o capricho de cada canal.
  renderMenu(menu: MenuPage): ListMessage | TextMenuMessage;
  // Passada final sobre toda a resposta antes de sair.
  renderOutgoing(messages: OutgoingMessage[], numberedChoices: boolean): ChannelRenderResult;
}

function truncateText(value: string, max: number): string {
  const chars = Array.from(String(value));
  if (chars.length <= max) return String(value);
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

function menuPageLabel(menu: MenuPage): string {
  return menu.totalPages > 1 ? MessagesConstants.MENU_PAGINA(menu.page + 1, menu.totalPages) : '';
}

class MetaCloudChannelStrategy implements ChannelMessageStrategy {
  renderMenu(menu: MenuPage): ListMessage {
    const rows: ListRow[] = menu.options.map((option: MenuOption) => {
      const details = [option.price ? '💰 ' + option.price : '', option.description || ''].filter(Boolean).join(' · ');
      const row: ListRow = { id: option.id, title: option.emoji + ' ' + option.title };
      if (details) row.description = details;
      return row;
    });
    if (menu.totalPages > 1) {
      rows.push(menu.hasMore
        ? { id: menu.nextId, title: MessagesConstants.MENU_VER_MAIS, description: MessagesConstants.MENU_VER_MAIS_DESCRICAO(menu.page + 2, menu.totalPages) }
        : { id: menu.nextId, title: MessagesConstants.MENU_DO_INICIO, description: MessagesConstants.MENU_DO_INICIO_DESCRICAO });
    }
    if (menu.checkout) rows.unshift({ id: menu.checkout.id, title: menu.checkout.title, description: menu.checkout.description });
    rows.push({ id: menu.backId, title: menu.backLabel });

    const body = [menu.heading, [menu.subtitle, menuPageLabel(menu)].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
    return this._fitList({ type: 'list', body, button: menu.button, sections: [{ title: menu.sectionTitle, rows }] });
  }

  renderOutgoing(messages: OutgoingMessage[]): ChannelRenderResult {
    const rendered = messages.map((message: OutgoingMessage): OutgoingMessage => {
      if (typeof message === 'string') return message;
      if (message.type === 'list') return this._fitList(message);
      if (message.type === 'buttons') return this._fitButtons(message);
      if (message.type === 'text_menu') return message.body;
      return message;
    });
    return { messages: rendered, choices: {} };
  }

  // Lista fora dos limites a Meta recusa inteira e o cliente fica sem resposta: aqui ela sempre cabe.
  private _fitList(list: ListMessage): ListMessage {
    let remaining = WHATSAPP_LIST_MAX_ROWS;
    const sections = list.sections
      .map((section) => {
        const rows = section.rows.slice(0, Math.max(remaining, 0)).map((row: ListRow) => {
          const fitted: ListRow = { id: truncateText(row.id, WHATSAPP_ROW_ID_MAX), title: truncateText(row.title, WHATSAPP_ROW_TITLE_MAX) };
          if (row.description) fitted.description = truncateText(row.description, WHATSAPP_ROW_DESCRIPTION_MAX);
          return fitted;
        });
        remaining -= rows.length;
        return { title: truncateText(section.title, WHATSAPP_ROW_TITLE_MAX), rows };
      })
      .filter((section) => section.rows.length > 0);
    return { type: 'list', body: list.body, button: truncateText(list.button || MessagesConstants.VER_OPCOES, WHATSAPP_LIST_BUTTON_MAX), sections };
  }

  // Mais de 3 botões a Meta não aceita: vira lista.
  private _fitButtons(message: ButtonMessage): ButtonMessage | ListMessage {
    if (message.buttons.length > WHATSAPP_MAX_BUTTONS) {
      return this._fitList({
        type: 'list', body: message.body, button: MessagesConstants.VER_OPCOES,
        sections: [{ title: MessagesConstants.OPCOES_TITULO, rows: message.buttons.map((button) => ({ id: button.id, title: button.title })) }],
      });
    }
    return { ...message, buttons: message.buttons.map((button) => ({ id: button.id, title: truncateText(button.title, WHATSAPP_BUTTON_TITLE_MAX) })) };
  }
}

class EvolutionTextChannelStrategy implements ChannelMessageStrategy {
  renderMenu(menu: MenuPage): TextMenuMessage {
    const choices: Record<string, string> = { '0': menu.backId };
    const lines: string[] = [menu.heading];
    if (menu.subtitle) lines.push(menu.subtitle);
    lines.push('');
    menu.options.forEach((option: MenuOption) => {
      choices[String(option.number)] = option.id;
      const name = '*' + option.number + '.* ' + option.emoji + ' *' + option.title + '*';
      if (!option.price) {
        // Categoria: a contagem vai na mesma linha.
        lines.push(name + (option.description ? ' · _' + option.description + '_' : ''));
        return;
      }
      lines.push(name + ' — *' + option.price + '*');
      if (option.description) lines.push('      _' + truncateText(option.description, MENU_TEXT_DESCRIPTION_MAX) + '_');
    });
    const pageLabel = menuPageLabel(menu);
    if (pageLabel) lines.push('', pageLabel);
    if (menu.hasMore) lines.push(MessagesConstants.PROXIMA_PAGINA(menu.page + 2));
    if (menu.checkout) lines.push('', MessagesConstants.MENU_FINALIZAR_TEXTO(menu.checkout.description));
    lines.push(MessagesConstants.MENU_INSTRUCAO_TEXTO(menu.backLabel));
    return { type: 'text_menu', body: lines.join('\n'), choices };
  }

  renderOutgoing(messages: OutgoingMessage[], numberedChoices: boolean): ChannelRenderResult {
    const choices: Record<string, string> = {};
    const rendered = messages.map((message: OutgoingMessage): OutgoingMessage => {
      if (typeof message === 'string') return message;
      if (message.type === 'text_menu') {
        Object.assign(choices, message.choices);
        return message.body;
      }
      if (message.type === 'list') {
        const options = message.sections.flatMap((section) => section.rows);
        return this._numbered(message.body, options, numberedChoices, choices);
      }
      if (message.type === 'buttons') {
        return this._numbered(message.body, message.buttons, numberedChoices, choices);
      }
      return message;
    });
    return { messages: rendered, choices };
  }

  private _numbered(body: string, options: Array<{ id: string; title: string; description?: string }>, numbered: boolean, choices: Record<string, string>): string {
    const lines: string[] = [body, ''];
    let number = 0;
    options.forEach((option) => {
      const description = option.description ? ' · _' + option.description + '_' : '';
      if (!numbered) {
        lines.push('• *' + option.title + '*' + description);
        return;
      }
      // "Voltar" fica sempre no 0, como no resto do bot.
      const shown = option.id === '0' ? 0 : ++number;
      choices[String(shown)] = option.id;
      lines.push('*' + shown + '.* *' + option.title + '*' + description);
    });
    if (numbered) lines.push(MessagesConstants.OPCAO_INSTRUCAO_TEXTO);
    return lines.join('\n');
  }
}

function channelStrategyFor(provider: string): ChannelMessageStrategy {
  if (provider === WhatsAppProvider.EVOLUTION) return new EvolutionTextChannelStrategy();
  return new MetaCloudChannelStrategy();
}

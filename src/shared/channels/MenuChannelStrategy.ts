// ── Cardápio por provedor de WhatsApp (Strategy) ─────────────────────────────
// Os handlers montam um MenuPage neutro (opções da página, ids, próxima/voltar) e a
// estratégia do provedor decide como ele chega ao cliente:
//   - meta_cloud (WhatsApp oficial): lista interativa com botão, até 10 linhas;
//   - evolution: texto numerado com negrito, porque botão/lista é instável lá.
// O número mostrado no texto e o id da linha levam ao mesmo lugar no handler, então
// tocar na lista ou digitar o número dá no mesmo.

const WHATSAPP_LIST_MAX_ROWS = 10;
const WHATSAPP_ROW_TITLE_MAX = 24;
const WHATSAPP_ROW_DESCRIPTION_MAX = 72;
const WHATSAPP_LIST_BUTTON_MAX = 20;

// Opções por página: 8 + "Ver mais" + "Voltar" = 10 linhas (limite da Meta).
const MENU_PAGE_SIZE = WHATSAPP_LIST_MAX_ROWS - 2;

interface MenuOption {
  id: string;            // id da linha na lista interativa
  number: number;        // número no texto (o handler aceita os dois)
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
}

interface MenuChannelStrategy {
  render(menu: MenuPage): ListMessage | string;
}

function truncateText(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

function menuPageLabel(menu: MenuPage): string {
  return menu.totalPages > 1 ? MessagesConstants.MENU_PAGINA(menu.page + 1, menu.totalPages) : '';
}

class MetaCloudMenuStrategy implements MenuChannelStrategy {
  render(menu: MenuPage): ListMessage {
    const rows: ListRow[] = menu.options.map((option: MenuOption) => {
      const details = [option.price ? '💰 ' + option.price : '', option.description || ''].filter(Boolean).join(' · ');
      const row: ListRow = { id: option.id, title: truncateText(option.emoji + ' ' + option.title, WHATSAPP_ROW_TITLE_MAX) };
      if (details) row.description = truncateText(details, WHATSAPP_ROW_DESCRIPTION_MAX);
      return row;
    });
    if (menu.totalPages > 1) {
      rows.push(menu.hasMore
        ? { id: menu.nextId, title: MessagesConstants.MENU_VER_MAIS, description: MessagesConstants.MENU_VER_MAIS_DESCRICAO(menu.page + 2, menu.totalPages) }
        : { id: menu.nextId, title: MessagesConstants.MENU_DO_INICIO, description: MessagesConstants.MENU_DO_INICIO_DESCRICAO });
    }
    rows.push({ id: menu.backId, title: truncateText(menu.backLabel, WHATSAPP_ROW_TITLE_MAX) });

    const body = [menu.heading, [menu.subtitle, menuPageLabel(menu)].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
    return {
      type: 'list',
      body,
      button: truncateText(menu.button, WHATSAPP_LIST_BUTTON_MAX),
      sections: [{ title: truncateText(menu.sectionTitle, WHATSAPP_ROW_TITLE_MAX), rows: rows.slice(0, WHATSAPP_LIST_MAX_ROWS) }],
    };
  }
}

class EvolutionTextMenuStrategy implements MenuChannelStrategy {
  render(menu: MenuPage): string {
    const lines: string[] = [menu.heading];
    if (menu.subtitle) lines.push(menu.subtitle);
    lines.push('');
    menu.options.forEach((option: MenuOption) => {
      const name = '*' + option.number + '.* ' + option.emoji + ' *' + option.title + '*';
      if (!option.price) {
        // Categoria: a contagem vai na mesma linha.
        lines.push(name + (option.description ? ' · _' + option.description + '_' : ''));
        return;
      }
      lines.push(name + ' — *' + option.price + '*');
      if (option.description) lines.push('      _' + truncateText(option.description, 70) + '_');
    });
    const pageLabel = menuPageLabel(menu);
    if (pageLabel) lines.push('', pageLabel);
    if (menu.hasMore) lines.push(MessagesConstants.PROXIMA_PAGINA(menu.page + 2));
    lines.push(MessagesConstants.MENU_INSTRUCAO_TEXTO(menu.backLabel));
    return lines.join('\n');
  }
}

const WhatsAppProvider = {
  META_CLOUD: 'meta_cloud',
  EVOLUTION: 'evolution',
} as const;

function menuStrategyFor(provider: string): MenuChannelStrategy {
  if (provider === WhatsAppProvider.EVOLUTION) return new EvolutionTextMenuStrategy();
  return new MetaCloudMenuStrategy();
}

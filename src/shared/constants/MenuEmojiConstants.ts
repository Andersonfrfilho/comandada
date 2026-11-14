// Emoji de categoria/item quando o cadastro não traz um. A primeira palavra-chave
// encontrada no nome vence, então as mais específicas vêm antes.
const MenuEmojiConstants: ReadonlyArray<{ keywords: string[]; emoji: string }> = [
  { keywords: ['combo', 'combinado', 'barca', 'festival', 'degusta'], emoji: '🍱' },
  { keywords: ['temaki'], emoji: '🍙' },
  { keywords: ['hot'], emoji: '🔥' },
  { keywords: ['sashimi', 'peixe', 'carpaccio', 'tartar', 'ceviche'], emoji: '🐟' },
  { keywords: ['camar', 'tempura', 'empanad', 'porç', 'porc', 'entrada', 'petisco'], emoji: '🍤' },
  { keywords: ['uramaki', 'urumaki', 'hossomaki', 'maki', 'roll', 'niguiri', 'nigiri', 'joe', 'jyo', 'sushi', 'hakusai'], emoji: '🍣' },
  { keywords: ['yakisoba', 'lamen', 'ramen', 'udon', 'macarr', 'missoshiru', 'sopa'], emoji: '🍜' },
  { keywords: ['arroz', 'gohan', 'onigiri'], emoji: '🍚' },
  { keywords: ['frango', 'carne', 'grelhad', 'teppan', 'prato', 'executivo'], emoji: '🍛' },
  { keywords: ['salada', 'sunomono', 'vegano', 'vegetar', 'legume'], emoji: '🥗' },
  { keywords: ['cerveja', 'chopp', 'chope'], emoji: '🍺' },
  { keywords: ['saquê', 'saque', 'sake', 'drink', 'vinho', 'caipi', 'alcool', 'álcool'], emoji: '🍶' },
  { keywords: ['suco', 'refri', 'bebida', 'água', 'agua', 'chá', 'cha ', 'soda', 'lata'], emoji: '🥤' },
  { keywords: ['sobremesa', 'doce', 'sorvete', 'petit', 'brownie', 'mochi', 'harumaki de choc'], emoji: '🍨' },
  { keywords: ['molho', 'adicional', 'extra', 'acompanha'], emoji: '🥢' },
];

const MENU_DEFAULT_EMOJI = '🍽️';

function menuEmojiFor(...names: Array<string | undefined | null>): string {
  for (const name of names) {
    const normalized = String(name || '').toLowerCase();
    if (!normalized) continue;
    const match = MenuEmojiConstants.find((entry) => entry.keywords.some((keyword: string) => normalized.includes(keyword)));
    if (match) return match.emoji;
  }
  return MENU_DEFAULT_EMOJI;
}

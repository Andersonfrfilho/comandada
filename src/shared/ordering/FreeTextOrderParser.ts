// ── Pedido em texto livre ────────────────────────────────────────────────────
// "quero 2 combo tradicional e 1 hot roll" → [{2, Combo Tradicional}, {1, hot roll → qual deles?}].
// Cada trecho do texto vira quantidade + palavras, e as palavras são comparadas com o nome de cada
// produto tolerando acento, plural, abreviação ("hot rol") e um erro de digitação. Um trecho que
// combina igualmente com vários produtos (ou com os tamanhos do mesmo item) vira pergunta em lista.
// Também é por aqui que passa o texto de um áudio já transcrito.

const AUDIO_UNCLEAR_TEXT = '__audio_unclear__';

interface FreeTextSegment {
  text: string;      // trecho como o cliente escreveu (para mostrar de volta)
  qty: number;
  tokens: string[];  // palavras que identificam o produto
}

interface FreeTextMatch {
  segment: FreeTextSegment;
  product: Product | null;    // certo: um produto só
  options: Product[];         // ambíguo: o cliente escolhe
}

interface FreeTextParseResult {
  matches: FreeTextMatch[];
  unrecognized: string[];
}

const FREE_TEXT_NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20, duzia: 12,
};

// Palavras que não dizem qual é o produto: pedido, cortesia, artigos e unidades.
const FREE_TEXT_STOPWORDS: ReadonlyArray<string> = [
  'quero', 'queria', 'quer', 'gostaria', 'vou', 'vamos', 'querer', 'pedir', 'peco', 'pede', 'pode', 'poderia', 'ser',
  'me', 've', 'ver', 'manda', 'mande', 'mandar', 'traz', 'traga', 'trazer', 'por', 'favor', 'pfv', 'pf', 'pls',
  'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'uns', 'umas', 'e', 'com', 'no', 'na', 'nos', 'nas', 'em',
  'para', 'pra', 'pro', 'mais', 'tambem', 'tb', 'tbm', 'ai', 'entao', 'so', 'apenas', 'ok', 'oi', 'ola', 'bom', 'boa',
  'dia', 'tarde', 'noite', 'x', 'un', 'und', 'unid', 'unidade', 'unidades', 'pecas', 'pcs', 'porfavor', 'aqui', 'eu',
  'nos', 'meu', 'minha', 'seria', 'sera', 'tipo', 'hoje', 'agora', 'mim', 'porcao', 'porcoes',
];

const FREE_TEXT_QTY_MAX = 99;
const FREE_TEXT_MIN_COVERAGE = 0.75;
const FREE_TEXT_AMBIGUITY_GAP = 0.12;
// Opções guardadas por pergunta; a lista mostra até 8 linhas (tamanhos do mesmo item viram uma só).
const FREE_TEXT_MAX_OPTIONS = 24;
const FREE_TEXT_MAX_ROWS = 8;

function normalizeFreeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Plural simples do português: temakis → temaki, porções → porcao, pães → pao.
function singularize(word: string): string {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  if (word.endsWith('oes') || word.endsWith('aes')) return word.slice(0, -3) + 'ao';
  if (word.endsWith('ns')) return word.slice(0, -2) + 'm';
  if (word.endsWith('is') && word.length > 4) return word.slice(0, -1);
  if (word.endsWith('es') && /(r|z|s)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function significantTokens(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter((word: string) => word && !FREE_TEXT_STOPWORDS.includes(word) && !(word in FREE_TEXT_NUMBER_WORDS))
    .map(singularize);
}

// Nome sem o parêntese de porção ("(8 un)") nem de tamanho ("(Médio)").
function productBaseTokens(product: Product): string[] {
  return significantTokens(normalizeFreeText(String(product.name || '').replace(/\([^)]*\)/g, ' ')));
}

// Nome-base mais o tamanho, quando o produto é variação: "temaki salmão grande" escolhe o tamanho.
function productTokens(product: Product): string[] {
  const tokens = productBaseTokens(product);
  if (product.variant_label) tokens.push(...significantTokens(normalizeFreeText(product.variant_label)));
  return tokens;
}

function editDistance(first: string, second: string): number {
  const previous: number[] = Array.from({ length: second.length + 1 }, (_value: unknown, index: number) => index);
  for (let row = 1; row <= first.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= second.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (first[row - 1] === second[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

function tokenSimilarity(queryToken: string, productToken: string): number {
  if (queryToken === productToken) return 1;
  const shorter = Math.min(queryToken.length, productToken.length);
  if (/^\d+$/.test(queryToken) || /^\d+$/.test(productToken)) return 0;
  if (shorter >= 3 && (productToken.startsWith(queryToken) || queryToken.startsWith(productToken))) return 0.85;
  if (shorter >= 4) {
    const distance = editDistance(queryToken, productToken);
    if (distance <= 1) return 0.8;
    if (distance <= 2 && shorter >= 7) return 0.7;
  }
  return 0;
}

function bestSimilarity(token: string, candidates: string[]): number {
  return candidates.reduce((best: number, candidate: string) => Math.max(best, tokenSimilarity(token, candidate)), 0);
}

interface ScoredProduct {
  product: Product;
  score: number;
  // O cliente disse o nome inteiro (sem contar o tamanho): "temaki de salmão" é exatamente o Temaki
  // de Salmão (e pergunta o tamanho), não o Temaki de Salmão Grelhado.
  saidWholeName?: boolean;
}

// Quanto das palavras do cliente está no nome (precisa ser quase tudo) e quanto do nome ele disse
// (desempata "hot roll" entre "Hot Roll" e "Hot Roll Especial").
function scoreProducts(tokens: string[], candidates: Product[]): ScoredProduct[] {
  const wordTokens = tokens.filter((token: string) => !/^\d+$/.test(token));
  if (wordTokens.length === 0) return [];
  const maxMissing = wordTokens.length >= 3 ? 1 : 0;
  const scored: ScoredProduct[] = [];
  for (const product of candidates) {
    const nameTokens = productTokens(product);
    if (nameTokens.length === 0) continue;
    // Número solto que não está no nome ("hot roll 8 un") não conta contra o produto.
    const relevantTokens = tokens.filter((token: string) => !/^\d+$/.test(token) || bestSimilarity(token, nameTokens) > 0);
    if (relevantTokens.length === 0) continue;
    const querySimilarities = relevantTokens.map((token: string) => bestSimilarity(token, nameTokens));
    const matched = querySimilarities.filter((similarity: number) => similarity > 0);
    const missing = querySimilarities.length - matched.length;
    // Uma palavra a mais em frase longa ("porção de camarão empanado caprichado") é tolerada.
    const matchedQuality = matched.length > 0 ? matched.reduce((sum: number, value: number) => sum + value, 0) / matched.length : 0;
    if (missing > maxMissing || matchedQuality < FREE_TEXT_MIN_COVERAGE) continue;
    const queryCoverage = querySimilarities.reduce((sum: number, value: number) => sum + value, 0) / relevantTokens.length;
    const baseTokens = productBaseTokens(product);
    const nameCoverage = baseTokens.length > 0
      ? baseTokens.reduce((sum: number, nameToken: string) => sum + bestSimilarity(nameToken, tokens), 0) / baseTokens.length
      : 0;
    const saidWholeName = baseTokens.every((nameToken: string) => bestSimilarity(nameToken, tokens) > 0);
    scored.push({ product, score: queryCoverage * 0.6 + nameCoverage * 0.4, saidWholeName });
  }
  return scored.sort((first: ScoredProduct, second: ScoredProduct) => second.score - first.score);
}

function matchFreeTextProduct(tokens: string[], candidates: Product[]): { product: Product | null; options: Product[] } {
  const allScored = scoreProducts(tokens, candidates);
  if (allScored.length === 0) return { product: null, options: [] };
  const wholeName = allScored.filter((entry: ScoredProduct) => entry.saidWholeName);
  const scored = wholeName.length > 0 ? wholeName : allScored;
  const best = scored[0];
  const close = scored.filter((entry: ScoredProduct) => best.score - entry.score < FREE_TEXT_AMBIGUITY_GAP);
  if (close.length === 1) return { product: best.product, options: [] };
  return { product: null, options: close.slice(0, FREE_TEXT_MAX_OPTIONS).map((entry: ScoredProduct) => entry.product) };
}

function parseQuantityAndTokens(text: string): FreeTextSegment {
  const words = normalizeFreeText(text).split(' ').filter(Boolean);
  // A quantidade vem antes do produto ("quero 2 hot roll", "meia dúzia de gyoza") ou no fim ("hot roll x2").
  while (words.length > 0 && FREE_TEXT_STOPWORDS.includes(words[0]) && !(words[0] in FREE_TEXT_NUMBER_WORDS)) words.shift();
  let qty = 1;
  const first = words[0] || '';
  const leadingMultiplier = first.match(/^(\d{1,2})x?$/);
  if (leadingMultiplier) {
    qty = parseInt(leadingMultiplier[1], 10);
    words.shift();
  } else if (first === 'meia' && words[1] === 'duzia') {
    qty = 6;
    words.splice(0, 2);
  } else if (first in FREE_TEXT_NUMBER_WORDS) {
    qty = FREE_TEXT_NUMBER_WORDS[first];
    words.shift();
    if (words[0] === 'duzia') { qty *= 12; words.shift(); }
  } else {
    const last = words[words.length - 1] || '';
    const beforeLast = words[words.length - 2] || '';
    const trailing = last.match(/^x(\d{1,2})$/) || (beforeLast === 'x' && last.match(/^(\d{1,2})$/));
    if (trailing) {
      qty = parseInt(trailing[1], 10);
      words.splice(words.length - (beforeLast === 'x' && !last.startsWith('x') ? 2 : 1));
    }
  }
  return { text: text.trim(), qty, tokens: significantTokens(words.join(' ')) };
}

// Separa "2 combo e 1 hot roll, 3 coca" em trechos. O "e" só separa quando vem uma quantidade
// depois, para não partir nome de produto como "Arroz e Feijão".
function splitFreeTextSegments(text: string): string[] {
  const quantityAhead = '(?=\\s*(?:\\d|um\\b|uma\\b|dois\\b|duas\\b|tr[eê]s\\b|quatro\\b|cinco\\b|seis\\b|sete\\b|oito\\b|nove\\b|dez\\b|meia\\b))';
  const separator = new RegExp('[\\n,;+]|\\s+(?:e|mais)\\s+' + quantityAhead, 'i');
  return text.split(separator).map((part: string) => part.trim()).filter(Boolean);
}

function parseFreeTextOrder(text: string, catalog: Product[]): FreeTextParseResult {
  const result: FreeTextParseResult = { matches: [], unrecognized: [] };
  if (!catalog || catalog.length === 0) return result;

  const resolveSegment = (part: string, allowSplit: boolean): void => {
    const segment = parseQuantityAndTokens(part);
    if (segment.tokens.length === 0) return;
    if (segment.qty < 1 || segment.qty > FREE_TEXT_QTY_MAX) { result.unrecognized.push(segment.text); return; }
    const { product, options } = matchFreeTextProduct(segment.tokens, catalog);
    if (product || options.length > 0) {
      result.matches.push({ segment, product, options });
      return;
    }
    // "hot roll e temaki" sem quantidade no meio: tenta cada lado do "e".
    const pieces = part.split(/\s+e\s+/i);
    if (allowSplit && pieces.length > 1) {
      pieces.forEach((piece: string) => resolveSegment(piece, false));
      return;
    }
    result.unrecognized.push(segment.text);
  };

  splitFreeTextSegments(text).forEach((part: string) => resolveSegment(part, true));
  return result;
}

// Entre as opções de uma pergunta, qual o cliente escreveu ("o de salmão", "grande").
function pickFreeTextOption(text: string, options: Product[]): Product | null {
  const tokens = significantTokens(normalizeFreeText(text));
  if (tokens.length === 0) return null;
  const scored = options
    .map((product: Product) => {
      const nameTokens = productTokens(product);
      const similarity = tokens.reduce((sum: number, token: string) => sum + bestSimilarity(token, nameTokens), 0) / tokens.length;
      return { product, score: similarity };
    })
    .filter((entry: ScoredProduct) => entry.score >= 0.5)
    .sort((first: ScoredProduct, second: ScoredProduct) => second.score - first.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.01) return null;
  return scored[0].product;
}

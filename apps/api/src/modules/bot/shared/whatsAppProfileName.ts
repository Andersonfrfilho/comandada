/**
 * Nome do perfil do WhatsApp (`contacts[].profile.name` do webhook da Meta).
 *
 * Duas formas: a crua, que o painel mostra como o cliente escreveu (com emoji e tudo), e a que
 * pode virar `customers.name`. A segunda segue a mesma regra do bot (`validateName` e
 * `capitalizeName` em `src/setup.ts`): o que o bot recusaria como nome não vira nome do cliente,
 * senão a saudação pularia a pergunta do nome com "🔥 Zé 123" gravado.
 */

const PROFILE_NAME_MAX_LENGTH = 255

const OFFENSIVE_WORDS = [
  'merda', 'porra', 'caralho', 'buceta', 'viado', 'puta', 'fdp', 'cuzão', 'cuza', 'cuzao', 'fuder', 'foder',
  'foda', 'arrombado', 'babaca', 'idiota', 'imbecil', 'cretino', 'otario', 'otário', 'lixo', 'vagabundo',
  'vagabunda', 'piranha', 'safado', 'safada', 'desgraça', 'desgraca', 'bosta', 'pau', 'cacete', 'xoxota',
  'pentelho', 'prostituta',
]

function withoutAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Espaços colapsados e tamanho da coluna; vazio vira `null`. */
export function cleanProfileName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, PROFILE_NAME_MAX_LENGTH).trim()
  return cleaned || null
}

/** Nome que o bot aceitaria do cliente, já com iniciais maiúsculas; `null` quando não serve. */
export function customerNameFromProfile(raw: string | null | undefined): string | null {
  const name = cleanProfileName(raw)
  if (!name || name.length < 2) return null
  if (/\d/.test(name)) return null
  if (!/^[\p{L}\s'-]+$/u.test(name)) return null
  if (/^(.)\1{3,}$/u.test(name.replace(/\s/g, ''))) return null
  const words = withoutAccents(name.toLowerCase()).split(/\s+/)
  if (OFFENSIVE_WORDS.some((word) => words.includes(withoutAccents(word)))) return null
  return name.replace(/(^|[^\p{L}])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase())
}

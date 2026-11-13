// meta-whatsapp-contracts imports node:crypto at the root entry; the UI never calls it, but the browser build needs the symbol.
export function createHash(): never {
  throw new Error('node:crypto createHash is not available in the browser');
}

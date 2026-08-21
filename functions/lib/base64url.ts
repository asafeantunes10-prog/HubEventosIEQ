/**
 * Base64Url — a variante de base64 usada em cookies e tokens, sem `+`, `/`
 * nem `=` (caracteres que precisariam de escape numa URL ou num cookie).
 *
 * Compartilhado entre `senha.ts` e `sessao.ts` para as duas nao reimplementarem
 * a mesma conversao de bytes.
 */

export function bytesParaBase64Url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlParaBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

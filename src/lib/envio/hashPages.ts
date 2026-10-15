import { blake3 } from 'hash-wasm'

/**
 * O hash que o Cloudflare Pages usa para identificar o conteudo de um arquivo.
 *
 * Nao e escolha nossa: e o formato exato do `wrangler pages deploy`
 * (`hashFile` no codigo dele) — `blake3(base64(conteudo) + extensao)`, em
 * hexadecimal, so os 32 primeiros caracteres. O deploy so aceita um manifesto
 * cujos hashes batam com o que foi enviado, entao qualquer desvio aqui vira
 * "arquivo faltando" na hora de publicar. `hashPages.test.ts` confere contra o
 * proprio blake3 do wrangler.
 *
 * Recebe o BASE64, e nao os bytes, porque o hash e calculado sobre o texto
 * base64 — e o envio precisa dele de qualquer forma, entao codifica-se uma vez.
 */
export async function hashPages(base64: string, extensao: string): Promise<string> {
  return (await blake3(base64 + extensao)).slice(0, 32)
}

/**
 * Bytes -> base64 sem estourar a pilha: `String.fromCharCode(...bytes)` com um
 * arquivo inteiro passa do limite de argumentos, entao vai em pedacos.
 */
export function bytesParaBase64(bytes: Uint8Array): string {
  const PEDACO = 0x8000
  let binario = ''
  for (let i = 0; i < bytes.length; i += PEDACO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + PEDACO))
  }
  return btoa(binario)
}

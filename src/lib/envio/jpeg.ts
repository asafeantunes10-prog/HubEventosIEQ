/**
 * Um JPEG termina com o marcador EOI (`FF D9`). Um arquivo cortado no meio —
 * copia interrompida, cartao com defeito, anexo de mensageiro — nao o tem.
 *
 * POR QUE VERIFICAR AQUI, E NAO CONFIAR NO NAVEGADOR
 * Os navegadores discordam: o Chrome recusa um JPEG truncado, o Firefox o
 * decodifica pela metade e entrega uma imagem com o rodape cinza, sem erro
 * nenhum. Publicar uma foto cortada em silencio seria exatamente o tipo de falha
 * que este painel existe para nao ter, entao a checagem e a mesma em qualquer
 * navegador.
 *
 * Seguro porque `FF D9` nao aparece no meio dos dados da imagem: dentro de um
 * trecho comprimido todo `FF` e seguido de `00` (escape) ou de um marcador de
 * reinicio (`D0`..`D7`). Ler so o final do arquivo basta — e evita ler 30 MB.
 */

export const JPEG_COMECO = [0xff, 0xd8] as const

/** O arquivo comeca como JPEG? */
export function pareceJpeg(inicio: Uint8Array): boolean {
  return inicio.length >= 2 && inicio[0] === JPEG_COMECO[0] && inicio[1] === JPEG_COMECO[1]
}

/**
 * `cauda` sao os ultimos bytes do arquivo. Uma camera pode deixar zeros (ou
 * imagens extras, como a miniatura MPF) depois do EOI, entao procura-se o
 * marcador na cauda inteira, e nao so nos dois ultimos bytes.
 */
export function terminaComEoi(cauda: Uint8Array): boolean {
  for (let i = cauda.length - 2; i >= 0; i--) {
    if (cauda[i] === 0xff && cauda[i + 1] === 0xd9) return true
  }
  return false
}

/** Quantos bytes finais ler para procurar o EOI. */
export const TAMANHO_DA_CAUDA = 8192

/** `true` se o blob e um JPEG que foi cortado antes do fim. */
export async function jpegIncompleto(blob: Blob): Promise<boolean> {
  const inicio = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  if (!pareceJpeg(inicio)) return false

  const cauda = new Uint8Array(
    await blob.slice(Math.max(0, blob.size - TAMANHO_DA_CAUDA)).arrayBuffer()
  )
  return !terminaComEoi(cauda)
}

/**
 * Hora em que uma foto Canon CR3 foi tirada, lida direto do arquivo.
 *
 * POR QUE ISTO EXISTE
 * Ordenar o lote pela hora da foto e o que mistura certo as fotos de duas cameras
 * (300 da Sony e 200 da Canon do mesmo culto). A biblioteca de EXIF usada nos
 * outros formatos nao entende o CR3 — que nao e TIFF como o ARW e o CR2, e sim um
 * container ISO-BMFF —, e sem a hora a foto cairia no fallback da data do arquivo,
 * misturando duas escalas de tempo na mesma ordenacao.
 *
 * COMO O CR3 GUARDA O EXIF
 * Numa caixa `uuid` perto do comeco do arquivo ha caixas `CMT1`..`CMT4`; cada uma
 * e uma estrutura TIFF completa (`II*\0` ...). A `CMT2` e o bloco "Exif", onde mora
 * `DateTimeOriginal` (tag 0x9003), uma string `AAAA:MM:DD HH:MM:SS`.
 */

/** Quantos bytes do inicio bastam: as caixas `CMT` ficam antes dos dados da imagem. */
export const BYTES_PARA_CR3 = 512 * 1024

const TAG_DATA_ORIGINAL = 0x9003
const TIPO_ASCII = 2

function acharAscii(bytes: Uint8Array, texto: string): number {
  const alvo = Array.from(texto, (c) => c.charCodeAt(0))
  busca: for (let i = 0; i + alvo.length <= bytes.length; i++) {
    for (let j = 0; j < alvo.length; j++) {
      if (bytes[i + j] !== alvo[j]) continue busca
    }
    return i
  }
  return -1
}

/** Container ISO-BMFF de CR3: `....ftypcrx `. */
export function ehCr3(inicio: Uint8Array): boolean {
  return (
    inicio.length >= 12 &&
    String.fromCharCode(...inicio.subarray(4, 8)) === 'ftyp' &&
    String.fromCharCode(...inicio.subarray(8, 11)) === 'crx'
  )
}

/**
 * `bytes` sao os primeiros bytes do arquivo. Devolve `AAAA-MM-DDTHH:MM:SS` (o
 * relogio da camera, sem fuso) ou `null`.
 */
export function horaDoCr3(bytes: Uint8Array): string | null {
  const caixa = acharAscii(bytes, 'CMT2')
  if (caixa < 0) return null

  // O TIFF comeca logo depois do nome da caixa. Os deslocamentos dentro dele sao
  // relativos a esse ponto.
  const base = caixa + 4
  if (base + 8 > bytes.length) return null

  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pequeno = bytes[base] === 0x49 && bytes[base + 1] === 0x49 // "II"
  if (!pequeno && !(bytes[base] === 0x4d && bytes[base + 1] === 0x4d)) return null

  const u16 = (o: number) => vista.getUint16(o, pequeno)
  const u32 = (o: number) => vista.getUint32(o, pequeno)

  const ifd = base + u32(base + 4)
  if (ifd + 2 > bytes.length) return null

  const entradas = u16(ifd)
  for (let i = 0; i < entradas; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > bytes.length) return null
    if (u16(e) !== TAG_DATA_ORIGINAL || u16(e + 2) !== TIPO_ASCII) continue

    // 20 bytes ("AAAA:MM:DD HH:MM:SS" + nulo) nao cabem nos 4 do campo de valor:
    // o campo guarda um deslocamento.
    const inicio = base + u32(e + 8)
    if (inicio + 19 > bytes.length) return null

    const texto = String.fromCharCode(...bytes.subarray(inicio, inicio + 19))
    const m = texto.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null
  }

  return null
}

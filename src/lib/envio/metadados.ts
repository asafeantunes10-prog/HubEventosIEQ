import exifr from 'exifr'

import { BYTES_PARA_CR3, ehCr3, horaDoCr3 } from './cr3.ts'
import { type Orientacao } from './orientacao.ts'

/**
 * O pouco de EXIF que o envio precisa: a orientacao (para girar a foto) e a hora
 * em que foi tirada (para ordenar o lote). Fica fora de `processarImagem.ts`
 * porque a tela tambem le a hora, antes de processar, e nao deve carregar o
 * codificador de WebP so por isso.
 */

/** Hora do EXIF -> `AAAA-MM-DDTHH:MM:SS` pelos componentes locais, sem converter de fuso. */
export function formatarHora(d: unknown): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  const p = (n: number, c = 2) => String(n).padStart(c, '0')
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

export type Metadados = {
  orientacao: Orientacao | null
  capturadaEm: string | null
  larguraExif: number | null
  alturaExif: number | null
}

/** Le so o necessario do EXIF; qualquer falha vira "nao sei", nunca um erro. */
export async function lerMetadados(blob: Blob): Promise<Metadados> {
  try {
    const tags = await exifr.parse(blob, {
      pick: ['Orientation', 'DateTimeOriginal', 'CreateDate', 'ExifImageWidth', 'ExifImageHeight'],
      // Valores brutos de orientacao (1..8), nao o texto "Rotate 90 CW".
      translateValues: false,
    })
    if (!tags) return { orientacao: null, capturadaEm: null, larguraExif: null, alturaExif: null }

    const o = tags.Orientation
    return {
      orientacao: typeof o === 'number' && o >= 1 && o <= 8 ? (o as Orientacao) : null,
      capturadaEm: formatarHora(tags.DateTimeOriginal) ?? formatarHora(tags.CreateDate),
      larguraExif: typeof tags.ExifImageWidth === 'number' ? tags.ExifImageWidth : null,
      alturaExif: typeof tags.ExifImageHeight === 'number' ? tags.ExifImageHeight : null,
    }
  } catch {
    return { orientacao: null, capturadaEm: null, larguraExif: null, alturaExif: null }
  }
}


/**
 * So a hora da foto, sem decodificar nada — para ordenar o lote antes de processar.
 *
 * O CR3 da Canon tem leitura propria (`cr3.ts`): a biblioteca de EXIF nao o entende,
 * e sem isso as fotos de uma Canon e de uma Sony do mesmo evento ficariam fora de
 * ordem entre si.
 */
export async function lerHoraDaFoto(blob: Blob): Promise<string | null> {
  const inicio = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (ehCr3(inicio)) {
    return horaDoCr3(new Uint8Array(await blob.slice(0, BYTES_PARA_CR3).arrayBuffer()))
  }
  return (await lerMetadados(blob)).capturadaEm
}

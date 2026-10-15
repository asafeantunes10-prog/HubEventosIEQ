import encodeWebp from '@jsquash/webp/encode.js'

import { bytesParaBase64, hashPages } from './hashPages.ts'
import { jpegIncompleto } from './jpeg.ts'
import { lerMetadados } from './metadados.ts'
import { navegadorGiraSozinho } from './navegadorGira.ts'
import {
  dimensoesOrientadas,
  matrizDaOrientacao,
  orientacaoValida,
  type Matriz,
  type Orientacao,
} from './orientacao.ts'

/**
 * Transforma UMA imagem nas duas versoes que o site publica, mais a miniatura
 * borrada — tudo no navegador de quem esta enviando.
 *
 * POR QUE NO NAVEGADOR
 * Subir o original significa subir 25 a 60 MB por foto RAW (um evento de 500
 * fotos seriam ~15 GB). Aqui o arquivo grande e lido do disco local, vira
 * ~500 KB de WebP e so isso sai pela rede. E o servidor nem teria como ajudar: a
 * Function tem 10 ms de CPU.
 *
 * Roda dentro de um Web Worker (`trabalhador.ts`) para a tela nao travar.
 *
 * AS DUAS VERSOES
 *   g  lado maior de 2048 px  — o visualizador, o download e o ZIP
 *   t  400 px de LARGURA      — a grade em mosaico
 * Nenhuma e ampliada: foto menor que o alvo fica no tamanho que tem.
 *
 * `g` mede o LADO MAIOR, nao a largura. O script antigo media a largura, o que
 * dava uma foto vertical de 2048x3072; so que, sem girar pelo EXIF, uma foto
 * vertical da camera (guardada deitada) saia 2048x1365 e DEITADA. Medir o lado
 * maior da o mesmo peso (~450 KB) a foto em pe ou deitada.
 */

export const LADO_MAIOR_GRANDE = 2048
export const LARGURA_MINIATURA = 400
const LARGURA_LQIP = 20

/**
 * 80 e o joelho da curva do WebP: abaixo disso o ceu e a pele comecam a mostrar
 * banding, acima o arquivo cresce sem diferenca visivel. `method` 4 e o meio da
 * escala do libwebp (0 a 6, o equivalente ao `effort` do sharp): o 6 que o script
 * antigo usava custa 2 a 3 vezes mais tempo no WASM para poupar poucos por cento.
 */
const QUALIDADE = 80
const METODO = 4
const QUALIDADE_LQIP = 32

/** Acima disso o navegador nao decodifica com seguranca (memoria da aba). */
const MAXIMO_DE_PIXELS = 200_000_000

export type VersaoGerada = {
  base64: string
  hash: string
  bytes: number
}

export type ImagemProcessada = {
  grande: VersaoGerada
  miniatura: VersaoGerada
  /** `data:image/webp;base64,...` de 20 px. */
  lqip: string
  /** Dimensoes da versao grande, JA GIRADAS. */
  largura: number
  altura: number
  /** Hora da foto no formato `AAAA-MM-DDTHH:MM:SS` (sem fuso), ou nulo. */
  capturadaEm: string | null
  avisos: string[]
}

/**
 * De onde vem os pixels. Um arquivo que o navegador decodifica sozinho (JPEG,
 * PNG, WebP, AVIF — ou a previa JPEG tirada de dentro de um RAW), ou pixels ja
 * revelados (RAW decodificado pela LibRaw).
 */
export type FonteDeImagem =
  | {
      tipo: 'arquivo'
      blob: Blob
      /**
       * Orientacao a usar quando o proprio arquivo nao traz giro (nenhuma tag, ou
       * tag 1). E o caso da previa dentro de um RAW: o giro mora no RAW, nao no
       * JPEG embutido.
       */
      orientacaoPadrao?: Orientacao
      capturadaEm?: string | null
      avisos?: string[]
    }
  | {
      tipo: 'pixels'
      pixels: ImageData
      orientacao: Orientacao
      capturadaEm?: string | null
      avisos?: string[]
    }

type Tela = OffscreenCanvas

function novaTela(largura: number, altura: number): Tela {
  return new OffscreenCanvas(Math.max(1, largura), Math.max(1, altura))
}

/** Contexto otimizado para quem vai ler os pixels de volta (`getImageData`). */
function contexto(tela: Tela): OffscreenCanvasRenderingContext2D {
  const ctx = tela.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/**
 * Reduz por metades ate chegar perto do alvo e so entao faz o desenho final.
 *
 * Um `drawImage` de 6000 px direto para 2048 usa um filtro que pula pixels e
 * serrilha linhas finas (cercas, grades, texto). Cada passo de 2:1 faz uma media
 * limpa; o passo final e pequeno, entao o filtro quase nao tem o que estragar.
 *
 * `matriz` e aplicada so no desenho FINAL, que e quando a orientacao entra: as
 * reducoes intermediarias acontecem na orientacao de origem.
 */
function desenharReduzido(
  origem: CanvasImageSource,
  larguraOrigem: number,
  alturaOrigem: number,
  larguraAlvo: number,
  alturaAlvo: number,
  matriz: Matriz,
  larguraDaTela: number,
  alturaDaTela: number
): Tela {
  let atual: CanvasImageSource = origem
  let aw = larguraOrigem
  let ah = alturaOrigem
  let intermediaria: Tela | null = null

  while (aw >= larguraAlvo * 2 && ah >= alturaAlvo * 2) {
    const nw = Math.ceil(aw / 2)
    const nh = Math.ceil(ah / 2)
    const proxima = novaTela(nw, nh)
    contexto(proxima).drawImage(atual, 0, 0, aw, ah, 0, 0, nw, nh)

    if (intermediaria) {
      // Libera a memoria do passo anterior sem esperar o coletor de lixo.
      intermediaria.width = 0
      intermediaria.height = 0
    }
    intermediaria = proxima
    atual = proxima
    aw = nw
    ah = nh
  }

  const final = novaTela(larguraDaTela, alturaDaTela)
  const ctx = contexto(final)
  ctx.setTransform(...matriz)
  ctx.drawImage(atual, 0, 0, aw, ah, 0, 0, larguraAlvo, alturaAlvo)

  if (intermediaria) {
    intermediaria.width = 0
    intermediaria.height = 0
  }
  return final
}

async function codificar(tela: Tela, qualidade: number): Promise<Uint8Array> {
  const pixels = contexto(tela).getImageData(0, 0, tela.width, tela.height)
  const buffer = await encodeWebp(pixels, { quality: qualidade, method: METODO })
  return new Uint8Array(buffer)
}

async function empacotar(bytes: Uint8Array): Promise<VersaoGerada> {
  const base64 = bytesParaBase64(bytes)
  return { base64, hash: await hashPages(base64, 'webp'), bytes: bytes.length }
}

export async function processarImagem(fonte: FonteDeImagem): Promise<ImagemProcessada> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'Este navegador não tem o recurso que prepara as fotos (OffscreenCanvas). Use a versão atual ' +
        'do Chrome, Edge, Firefox ou Safari 16.4 ou mais novo.'
    )
  }

  const avisos = [...(fonte.avisos ?? [])]
  let capturadaEm = fonte.capturadaEm ?? null

  let bitmap: ImageBitmap
  let orientacao: Orientacao

  if (fonte.tipo === 'arquivo') {
    // Antes de decodificar: o Firefox aceitaria a foto cortada e a entregaria pela metade.
    if (await jpegIncompleto(fonte.blob)) {
      throw new Error(
        'Este JPEG está incompleto (o arquivo foi cortado). Copie a foto do cartão de novo.'
      )
    }

    const meta = await lerMetadados(fonte.blob)
    capturadaEm ??= meta.capturadaEm

    try {
      bitmap = await createImageBitmap(fonte.blob)
    } catch {
      throw new Error('Não consegui abrir este arquivo. Ele pode estar corrompido ou incompleto.')
    }

    /*
      QUEM GIRA: o navegador, o proprio arquivo ou o RAW de onde ele veio?

      - O JPEG traz uma orientacao DIFERENTE de 1: o giro e dele. Um navegador que
        gira sozinho JA entregou os pixels em pe (girar de novo estraga); um que nao
        gira precisa que a gente gire.
      - O JPEG nao traz nada, ou traz 1: nao ha giro proprio a aplicar. Se ele veio
        de dentro de um RAW, vale a orientacao do RAW (`orientacaoPadrao`) — as
        previas embutidas costumam declarar 1 mesmo quando a foto foi tirada na
        vertical, porque a camera guarda os pixels na posicao do sensor e anota o
        giro so no RAW.
    */
    if (meta.orientacao !== null && meta.orientacao !== 1) {
      orientacao = (await navegadorGiraSozinho()) ? 1 : orientacaoValida(meta.orientacao)
    } else {
      orientacao = orientacaoValida(fonte.orientacaoPadrao ?? 1)
    }
  } else {
    bitmap = await createImageBitmap(fonte.pixels)
    orientacao = orientacaoValida(fonte.orientacao)
  }

  try {
    const { width: w, height: h } = bitmap
    if (w * h > MAXIMO_DE_PIXELS) {
      throw new Error('A imagem é grande demais para o navegador processar.')
    }

    // --- versao grande: lado maior de 2048, sem ampliar -----------------------
    const escala = Math.min(1, LADO_MAIOR_GRANDE / Math.max(w, h))
    const gw = Math.max(1, Math.round(w * escala)) // alvo, ainda sem girar
    const gh = Math.max(1, Math.round(h * escala))
    const orientada = dimensoesOrientadas(gw, gh, orientacao)

    const telaGrande = desenharReduzido(
      bitmap,
      w,
      h,
      gw,
      gh,
      matrizDaOrientacao(orientacao, gw, gh),
      orientada.largura,
      orientada.altura
    )
    // Daqui para a frente so a tela grande importa; o original pode sair da memoria.
    bitmap.close()

    // --- miniatura: 400 de largura, tirada da versao grande ja girada ---------
    const escalaT = Math.min(1, LARGURA_MINIATURA / telaGrande.width)
    const tw = Math.max(1, Math.round(telaGrande.width * escalaT))
    const th = Math.max(1, Math.round(telaGrande.height * escalaT))
    const telaMiniatura = desenharReduzido(
      telaGrande,
      telaGrande.width,
      telaGrande.height,
      tw,
      th,
      [1, 0, 0, 1, 0, 0],
      tw,
      th
    )

    // --- LQIP: 20 px de largura -----------------------------------------------
    const lw = Math.min(LARGURA_LQIP, tw)
    const lh = Math.max(1, Math.round((th * lw) / tw))
    const telaLqip = desenharReduzido(telaMiniatura, tw, th, lw, lh, [1, 0, 0, 1, 0, 0], lw, lh)

    const [bytesGrande, bytesMiniatura, bytesLqip] = [
      await codificar(telaGrande, QUALIDADE),
      await codificar(telaMiniatura, QUALIDADE),
      await codificar(telaLqip, QUALIDADE_LQIP),
    ]

    const resultado: ImagemProcessada = {
      grande: await empacotar(bytesGrande),
      miniatura: await empacotar(bytesMiniatura),
      lqip: `data:image/webp;base64,${bytesParaBase64(bytesLqip)}`,
      largura: telaGrande.width,
      altura: telaGrande.height,
      capturadaEm,
      avisos,
    }

    telaGrande.width = 0
    telaMiniatura.width = 0
    telaLqip.width = 0
    return resultado
  } finally {
    // `close` duas vezes e inofensivo; garante a liberacao se algo falhou antes.
    bitmap.close()
  }
}

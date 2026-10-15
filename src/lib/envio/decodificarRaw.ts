import { LibRaw } from '@colorhythm/libraw-wasm'

import { formatarHora } from './metadados.ts'
import { orientacaoDoFlipLibRaw } from './orientacao.ts'
import { LADO_MAIOR_GRANDE, type FonteDeImagem } from './processarImagem.ts'

/**
 * Le uma foto RAW e devolve algo que `processarImagem` sabe tratar.
 *
 * DUAS ROTAS, e a primeira e a que quase sempre vale
 *
 *  1. PREVIA EMBUTIDA. Toda camera grava dentro do RAW um JPEG pronto — o que ela
 *     mostra no visor. Nas amostras reais (Sony FX30, Canon R6, R7 e 5D IV) ele vem
 *     em TAMANHO CHEIO (6192x4128 na FX30), com o visual que o fotografo viu na
 *     camera. E rapido (meio segundo) e fiel. E o que "RAW como saiu da camera"
 *     quer dizer.
 *  2. REVELACAO. Se a previa nao existe ou e pequena demais para o tamanho grande
 *     (alguns DNG de celular e modelos antigos), o RAW e revelado pela LibRaw em
 *     meia resolucao. Sai mais escuro e sem o contraste da camera — o desenvolvimento
 *     neutro de um RAW — e por isso a tela avisa.
 *
 * O giro (`flip`) mora no RAW, nao no JPEG embutido: a previa vem na posicao do
 * sensor. `processarImagem` aplica a orientacao daqui quando o JPEG nao traz a dele.
 *
 * Edicoes feitas no Lightroom/Camera Raw NAO aparecem: ficam num arquivo .xmp ou no
 * catalogo, fora do RAW, e nenhum navegador as le. Quem quer a foto editada exporta
 * JPEG — o RAW aqui e o "puro".
 */

let iniciada: Promise<unknown> | null = null

function iniciar(): Promise<unknown> {
  iniciada ??= LibRaw.initialize()
  return iniciada
}

/** O texto que a pessoa le quando a LibRaw nao consegue abrir o arquivo. */
function erroLegivel(e: unknown, extensao: string): Error {
  const tecnico = e instanceof Error ? e.message : String(e)
  return new Error(
    `Não consegui ler este arquivo RAW (.${extensao}). Ele pode estar incompleto, ou a câmera ` +
      `ser nova demais para o leitor. Detalhe técnico: ${tecnico}`
  )
}

export async function decodificarRaw(arquivo: File, extensao: string): Promise<FonteDeImagem> {
  await iniciar()

  const leitor = new LibRaw()
  await leitor.waitUntilReady()

  try {
    try {
      leitor.open(await arquivo.arrayBuffer())
    } catch (e) {
      throw erroLegivel(e, extensao)
    }

    const orientacao = orientacaoDoFlipLibRaw(leitor.getFlip())

    // A hora vem como segundos desde 1970 lidos com o fuso deste computador (a
    // camera nao grava fuso), entao os componentes LOCAIS devolvem o relogio da
    // camera — a mesma convencao de `formatarHora` para o EXIF dos JPEG.
    const segundos = Number(leitor.getImgOther().timestamp)
    const capturadaEm = segundos > 0 ? formatarHora(new Date(segundos * 1000)) : null

    // --- rota 1: previa embutida ------------------------------------------------
    let previa: Blob | null = null
    let ladoDaPrevia = 0
    try {
      leitor.unpackThumb()
      const miniatura = leitor.dcrawMakeMemThumb()
      if (miniatura.type_ === 'LIBRAW_IMAGE_JPEG' && miniatura.data.length > 0) {
        previa = new Blob([miniatura.data], { type: 'image/jpeg' })
        ladoDaPrevia = Math.max(miniatura.width, miniatura.height)
      }
    } catch {
      // Sem previa legivel: cai para a revelacao.
    }

    // Dimensao desconhecida (0) com arquivo grande: confia, o navegador confirma ao abrir.
    const previaServe =
      previa !== null &&
      (ladoDaPrevia >= LADO_MAIOR_GRANDE || (ladoDaPrevia === 0 && previa.size > 400 * 1024))

    if (previa && previaServe) {
      return { tipo: 'arquivo', blob: previa, orientacaoPadrao: orientacao, capturadaEm }
    }

    // --- rota 2: revelar em meia resolucao --------------------------------------
    try {
      leitor.setHalfSize(1)
      leitor.setUseCameraWb(1)
      leitor.setOutputBps(8)
      leitor.setOutputColor(1) // sRGB
      leitor.unpack()
      leitor.dcrawProcess()
      const imagem = leitor.dcrawMakeMemImage()

      if (imagem.colors !== 3 || imagem.bits !== 8) {
        throw new Error(`formato inesperado (${imagem.colors} canais, ${imagem.bits} bits)`)
      }

      // RGB (3 bytes por pixel) -> RGBA (4), o que o canvas espera.
      const rgba = new Uint8ClampedArray(imagem.width * imagem.height * 4)
      const rgb = imagem.data
      for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
        rgba[j] = rgb[i]
        rgba[j + 1] = rgb[i + 1]
        rgba[j + 2] = rgb[i + 2]
        rgba[j + 3] = 255
      }

      return {
        tipo: 'pixels',
        pixels: new ImageData(rgba, imagem.width, imagem.height),
        orientacao,
        capturadaEm,
        avisos: [
          'Este RAW não traz uma prévia grande, então foi revelado pelo site. Pode ficar mais escuro ' +
            'que na câmera.',
        ],
      }
    } catch (e) {
      // Revelar falhou, mas a previa pequena existe: melhor uma foto menor que nenhuma.
      if (previa) {
        return {
          tipo: 'arquivo',
          blob: previa,
          orientacaoPadrao: orientacao,
          capturadaEm,
          avisos: [
            `Não consegui revelar este RAW; usei a prévia embutida, que é pequena (${ladoDaPrevia} px).`,
          ],
        }
      }
      throw erroLegivel(e, extensao)
    }
  } finally {
    leitor.dispose()
  }
}

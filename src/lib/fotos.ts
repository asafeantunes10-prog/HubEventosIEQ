import type { TamanhoFoto } from '@/lib/tipos'

/**
 * Gera as tres versoes WebP de uma foto — inteiramente dentro do navegador,
 * antes de qualquer upload. SEM marca d'agua: aqui as fotos sao entregues, nao
 * vendidas.
 *
 * POR QUE NO NAVEGADOR, E NAO NO SERVIDOR
 * Uma Pages Function teria que baixar o original, processar e reenviar — o
 * triplo do trafego, com 10ms de CPU e memoria apertada. Aqui o custo e zero:
 * quem envia e UMA pessoa, no computador dela, onde a foto ja esta, e a CPU
 * fica ociosa enquanto o upload sobe de qualquer jeito. As levas grandes (500
 * fotos) usam o `npm run publicar`, que faz o mesmo com `sharp` no PC.
 *
 * MEMORIA — a parte que exige cuidado
 * Uma foto de camera moderna tem 6000x4000. Descomprimida em RGBA sao
 * 6000 x 4000 x 4 = 96 MB. Enviar 200 dessas de uma vez, sem cuidado, trava a
 * aba.
 *
 * Tres defesas, nesta ordem:
 *
 *   1. `createImageBitmap(arquivo, { resizeWidth, resizeHeight })` decodifica
 *      JA no tamanho final. O bitmap de 96 MB nunca chega a existir — o
 *      decodificador do navegador escala durante a decodificacao. Este e o
 *      ganho grande, e a razao de o codigo descobrir as dimensoes ANTES de
 *      decodificar (ver `medir()` abaixo).
 *   2. UMA decodificacao para as tres versoes. O bitmap sai ja no tamanho da
 *      versao grande e as outras duas saem dele por `drawImage`. Decodificar o
 *      arquivo tres vezes gastaria o triplo do tempo sem ganhar nitidez.
 *   3. Todo `ImageBitmap` leva `.close()` num `finally`. Sem isso a memoria so
 *      volta quando o coletor de lixo resolve rodar, que costuma ser tarde
 *      demais num laco de 200 fotos.
 *
 * Quem chama tambem faz a sua parte: `EnvioEmMassa.tsx` processa no maximo tres
 * arquivos ao mesmo tempo.
 */

/**
 * As tres larguras que vao para o R2, e o orcamento por tras delas.
 *
 * A soma da ~610 KB por foto, ~305 MB num evento de 500 — cerca de 33 eventos
 * nos 10 GB gratuitos do R2. Guardar o original da camera seria ~2,5 GB por
 * evento e acabaria com o espaco em quatro eventos; 2048px ja serve para
 * Instagram, WhatsApp e impressao ate 15x21cm.
 */
export const LARGURAS: Record<TamanhoFoto, number> = {
  t: 400,
  m: 1080,
  g: 2048,
}

/**
 * 0.82 e o joelho da curva do WebP: abaixo disso o ceu e a pele comecam a
 * mostrar banding, acima o arquivo cresce sem diferenca visivel na tela.
 */
const QUALIDADE = 0.82

/** Largura do LQIP. 20px viram ~400 bytes de base64 — cabem no JSON da lista. */
const LARGURA_LQIP = 20

export type VersoesGeradas = {
  /** Um blob WebP por tamanho. */
  blobs: Record<TamanhoFoto, Blob>
  /** Dimensoes da versao grande — as que vao para o banco. */
  largura: number
  altura: number
  /** `data:image/webp;base64,...` de 20px, embutido no JSON da galeria. */
  lqip: string
}

/**
 * Descobre largura e altura SEM decodificar a imagem inteira em memoria.
 *
 * Um `<img>` com object URL resolve `naturalWidth`/`naturalHeight` a partir do
 * cabecalho do arquivo; o navegador gerencia esse buffer fora do heap do JS e o
 * libera assim que o elemento e descartado. Fazer isso antes de
 * `createImageBitmap` e o que permite passar o tamanho final ja na
 * decodificacao — ver a nota de MEMORIA no topo.
 */
function medir(arquivo: File): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()

    img.onload = () => {
      const medidas = { largura: img.naturalWidth, altura: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(medidas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Arquivo de imagem inválido ou corrompido.'))
    }

    img.src = url
  })
}

/** Encolhe para caber na largura pedida. Nunca aumenta: ampliar so inventa pixel. */
function calcularDestino(largura: number, altura: number, larguraMaxima: number) {
  if (largura <= larguraMaxima) return { largura, altura }

  const fator = larguraMaxima / largura
  return {
    largura: larguraMaxima,
    altura: Math.max(1, Math.round(altura * fator)),
  }
}

/**
 * `OffscreenCanvas` mantem o trabalho fora da thread de layout e tem
 * `convertToBlob`, que e uma promessa de verdade. O `<canvas>` normal e o
 * caminho de compatibilidade (Safari antigo), com `toBlob` embrulhado numa
 * promessa.
 */
function criarTela(largura: number, altura: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const tela = new OffscreenCanvas(largura, altura)
    const ctx = tela.getContext('2d')
    if (!ctx) throw new Error('Não consegui preparar a imagem (canvas indisponível).')
    return { tela, ctx: ctx as OffscreenCanvasRenderingContext2D }
  }

  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  const ctx = tela.getContext('2d')
  if (!ctx) throw new Error('Não consegui preparar a imagem (canvas indisponível).')
  return { tela, ctx }
}

function paraBlob(
  tela: OffscreenCanvas | HTMLCanvasElement,
  qualidade: number
): Promise<Blob> {
  if (tela instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      tela.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não consegui gerar a imagem.'))),
        'image/webp',
        qualidade
      )
    })
  }
  return tela.convertToBlob({ type: 'image/webp', quality: qualidade })
}

/** Desenha o bitmap num tamanho menor e devolve o WebP correspondente. */
async function reduzir(
  origem: ImageBitmap,
  largura: number,
  altura: number,
  qualidade = QUALIDADE
): Promise<Blob> {
  const { tela, ctx } = criarTela(largura, altura)

  /*
    `imageSmoothingQuality: 'high'` usa reamostragem de qualidade em vez do
    vizinho mais proximo. Numa reducao de 2048 para 400 a diferenca e enorme:
    sem ela a miniatura sai serrilhada em todo contorno.
  */
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(origem, 0, 0, largura, altura)

  return paraBlob(tela, qualidade)
}

function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result as string)
    leitor.onerror = () => reject(new Error('Não consegui gerar a prévia borrada.'))
    leitor.readAsDataURL(blob)
  })
}

export async function gerarVersoes(arquivo: File): Promise<VersoesGeradas> {
  const original = await medir(arquivo)
  const grande = calcularDestino(original.largura, original.altura, LARGURAS.g)

  /*
    `resizeQuality: 'high'` usa reamostragem de qualidade (Lanczos ou
    equivalente, depende do navegador) em vez do vizinho mais proximo. E o que
    separa uma foto nitida de uma borrada.
  */
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo, {
      resizeWidth: grande.largura,
      resizeHeight: grande.altura,
      resizeQuality: 'high',
    })
  } catch {
    // Navegador sem suporte as opcoes de resize: decodifica inteiro e deixa o
    // `drawImage` escalar. Gasta mais memoria, mas funciona.
    bitmap = await createImageBitmap(arquivo)
  }

  try {
    const media = calcularDestino(grande.largura, grande.altura, LARGURAS.m)
    const thumb = calcularDestino(grande.largura, grande.altura, LARGURAS.t)
    const mini = calcularDestino(grande.largura, grande.altura, LARGURA_LQIP)

    const blobs: Record<TamanhoFoto, Blob> = {
      g: await reduzir(bitmap, grande.largura, grande.altura),
      m: await reduzir(bitmap, media.largura, media.altura),
      t: await reduzir(bitmap, thumb.largura, thumb.altura),
    }

    // Qualidade baixa de proposito: o LQIP aparece borrado por baixo da foto
    // real, e cada byte dele viaja no JSON de TODAS as fotos da pagina.
    const lqip = await paraDataUrl(await reduzir(bitmap, mini.largura, mini.altura, 0.5))

    return { blobs, largura: grande.largura, altura: grande.altura, lqip }
  } finally {
    // Ver a nota de MEMORIA no topo: sem isto, 200 fotos deixam ate 200 bitmaps
    // esperando o coletor de lixo, e a aba morre bem no meio do envio.
    bitmap.close()
  }
}

/** Exportado para os testes e para o painel exibir o que sera gerado. */
export const parametrosVersoes = {
  larguras: LARGURAS,
  qualidade: QUALIDADE,
  calcularDestino,
}

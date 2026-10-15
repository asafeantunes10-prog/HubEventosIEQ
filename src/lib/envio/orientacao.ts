/**
 * Orientacao EXIF (1 a 8) e como desenhar uma foto de acordo com ela.
 *
 * POR QUE ISTO E FEITO A MAO, EM VEZ DE CONFIAR NO NAVEGADOR
 * `createImageBitmap` ate sabe girar pelo EXIF, mas cada navegador e cada versao
 * decide por conta propria se o faz por padrao, e a prévia JPEG dentro de um RAW
 * muitas vezes NAO traz a orientacao (ela esta no RAW, nao no JPEG). Foi a falta
 * de uma rotacao explicita que deixou as fotos "de lado" no primeiro evento:
 * o `sharp` apagou o EXIF na saida e ninguem havia girado os pixels antes.
 *
 * Aqui os pixels sao girados de forma explicita, e as dimensoes que vao para o
 * banco sao as JA GIRADAS — e e delas que a grade da galeria tira a proporcao
 * do cartao.
 */

/** 1 = sem giro. 2..8 sao as outras sete combinacoes de espelhar/girar do EXIF. */
export type Orientacao = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** `[a, b, c, d, e, f]` de `CanvasRenderingContext2D.setTransform`. */
export type Matriz = [number, number, number, number, number, number]

export function orientacaoValida(valor: unknown): Orientacao {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 8
    ? (valor as Orientacao)
    : 1
}

/** 5 a 8 trocam largura por altura. */
export function trocaEixos(o: Orientacao): boolean {
  return o >= 5
}

/** Largura e altura da imagem DEPOIS de girada. */
export function dimensoesOrientadas(
  largura: number,
  altura: number,
  o: Orientacao
): { largura: number; altura: number } {
  return trocaEixos(o) ? { largura: altura, altura: largura } : { largura, altura }
}

/**
 * A matriz que leva um desenho de `largura x altura` (sem girar) para a posicao
 * certa num canvas das dimensoes ja orientadas. Conferida ponto a ponto em
 * `orientacao.test.ts`.
 */
export function matrizDaOrientacao(o: Orientacao, largura: number, altura: number): Matriz {
  switch (o) {
    case 1:
      return [1, 0, 0, 1, 0, 0]
    case 2:
      return [-1, 0, 0, 1, largura, 0]
    case 3:
      return [-1, 0, 0, -1, largura, altura]
    case 4:
      return [1, 0, 0, -1, 0, altura]
    case 5:
      return [0, 1, 1, 0, 0, 0]
    case 6:
      return [0, 1, -1, 0, altura, 0]
    case 7:
      return [0, -1, -1, 0, altura, largura]
    case 8:
      return [0, -1, 1, 0, 0, largura]
  }
}

/**
 * O codigo de giro da LibRaw (`flip`) nao e o do EXIF: ela usa o vocabulario do
 * dcraw, onde 3 = 180 graus, 5 = 90 anti-horario e 6 = 90 horario. Traduzido
 * aqui para a mesma escala 1..8 do resto do codigo.
 *
 * ATENCAO: a correspondencia vem da documentacao da LibRaw e precisa ser
 * conferida com uma foto vertical de cada camera (o teste de viabilidade do
 * RAW faz isso).
 */
export function orientacaoDoFlipLibRaw(flip: number): Orientacao {
  switch (flip) {
    case 3:
      return 3
    case 5:
      return 8
    case 6:
      return 6
    default:
      return 1
  }
}

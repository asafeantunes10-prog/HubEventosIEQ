/**
 * Que arquivos o painel sabe enviar, e o que dizer sobre os outros.
 *
 * O ponto central e que NENHUM arquivo escolhido pode sumir em silencio. O
 * `npm run publicar` antigo filtrava por extensao e descartava o resto sem uma
 * palavra — e foi assim que as fotos RAW "nao entravam" no primeiro evento sem
 * ninguem saber por que. Aqui todo arquivo recebe uma classificacao, e o que nao
 * e aceito volta com o motivo escrito para a tela.
 */

/** Formatos que o navegador decodifica sozinho. */
const IMAGEM = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'webp', 'avif'])

/**
 * RAW de camera. Sony (`arw`) e Canon (`cr2`, `cr3`) sao os da equipe; os demais
 * entram porque a leitura e a mesma (LibRaw), mas so os dois primeiros foram
 * testados com arquivo de verdade.
 */
const RAW = new Set([
  'arw',
  'cr2',
  'cr3',
  'crw',
  'nef',
  'nrw',
  'raf',
  'orf',
  'rw2',
  'dng',
  'pef',
  'srw',
])

/**
 * Arquivos que acompanham a foto sem ser foto: o Lightroom e a camera deixam
 * `.xmp`, `.thm` e companhia na mesma pasta. Aparecer um "erro" para cada um
 * afogaria os erros de verdade, entao so sao contados.
 */
const APOIO = new Set(['xmp', 'xml', 'dop', 'pp3', 'thm', 'db', 'ini', 'lrdata', 'cos', 'acr', 'txt'])

const VIDEO = new Set(['mp4', 'mov', 'mxf', 'avi', 'mkv', 'mts', 'm4v'])

export type Classificacao =
  | { tipo: 'imagem'; extensao: string }
  | { tipo: 'raw'; extensao: string }
  | { tipo: 'ignorar'; extensao: string }
  | { tipo: 'nao-suportado'; extensao: string; motivo: string }

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.')
  return ponto === -1 ? '' : nome.slice(ponto + 1).toLowerCase()
}

export function classificar(nome: string): Classificacao {
  const extensao = extensaoDe(nome)
  const base = nome.split(/[\\/]/).pop() ?? nome

  // `._IMG_0001.JPG` e o rastro que o macOS deixa em cartao e pendrive; nao e foto.
  if (base.startsWith('.') || base.toLowerCase() === 'thumbs.db') {
    return { tipo: 'ignorar', extensao }
  }
  if (IMAGEM.has(extensao)) return { tipo: 'imagem', extensao }
  if (RAW.has(extensao)) return { tipo: 'raw', extensao }
  if (APOIO.has(extensao)) return { tipo: 'ignorar', extensao }

  if (extensao === 'heic' || extensao === 'heif') {
    return {
      tipo: 'nao-suportado',
      extensao,
      motivo: 'HEIC (foto de iPhone) ainda não é aceito. Exporte como JPEG.',
    }
  }
  if (extensao === 'tif' || extensao === 'tiff') {
    return {
      tipo: 'nao-suportado',
      extensao,
      motivo: 'TIFF não é aceito pelo navegador. Exporte como JPEG.',
    }
  }
  if (VIDEO.has(extensao)) {
    return { tipo: 'nao-suportado', extensao, motivo: 'Vídeo não é aceito aqui, só fotos.' }
  }

  return {
    tipo: 'nao-suportado',
    extensao,
    motivo: extensao
      ? `Formato .${extensao} não é aceito.`
      : 'Arquivo sem extensão, não sei o que é.',
  }
}

/** Para o atributo `accept` do seletor de arquivos. */
export const ACCEPT_DO_SELETOR = [...IMAGEM, ...RAW].map((e) => `.${e}`).join(',')

/**
 * O UNICO lugar do codigo que sabe de onde vem uma foto.
 *
 * As fotos nao moram num servico de armazenamento: elas sao ARQUIVOS ESTATICOS
 * do proprio site, publicados junto com ele em `/fotos/...`. Isso decide o
 * projeto inteiro, e por dois motivos:
 *
 *   1. Nao exige cartao de credito. O R2 exige, mesmo no plano gratuito — e
 *      cartao nao e uma opcao aqui.
 *   2. Requisicao a asset estatico no Cloudflare Pages e gratis e ILIMITADA.
 *      Servir a foto por uma Function custaria uma das 100 mil requisicoes
 *      diarias por miniatura, e um ZIP de 500 fotos comeria meio dia de quota
 *      de uma vez. Como asset estatico, esse teto simplesmente nao existe.
 *
 * O banco guarda so o `caminho` — `culto-jovens-2026/a1b2`, sem sufixo e sem
 * extensao. Montar a URL aqui, e so aqui, e o que torna barata uma mudanca
 * futura: migrar para o R2 (se um dia houver cartao) ou quebrar o site em um
 * segundo projeto Pages passa a ser mexer nesta funcao, e em nenhuma tela.
 */

/**
 * Dois tamanhos, nao tres.
 *
 * O gargalo deste projeto e CONTAGEM DE ARQUIVOS (20.000 por site no plano
 * gratuito), nao espaco em disco. Cada tamanho a mais custa 500 arquivos por
 * evento — um tamanho medio de 1080px cortaria a vida util do site de ~20 para
 * ~13 eventos. A troca foi consciente: ~420 KB a mais no visualizador em troca
 * de sete eventos a mais.
 */
export type TamanhoFoto =
  /** 400px, ~30 KB — a grade em mosaico. */
  | 't'
  /** 2048px, ~450 KB — o visualizador, o download e o ZIP. */
  | 'g'

/** Prefixo dos assets. Bate com a pasta `fotos/`, que o script popula. */
const BASE = '/fotos'

export function urlFoto(caminho: string, tamanho: TamanhoFoto): string {
  return `${BASE}/${caminho}-${tamanho}.webp`
}

/**
 * Nome do arquivo que a pessoa ve ao salvar a foto no disco.
 *
 * O numero vem primeiro e vem preenchido com zeros para o gerenciador de
 * arquivos ordenar igual a galeria: sem isso, "foto-10" aparece antes de
 * "foto-2" e a sequencia do evento se perde na pasta de downloads.
 */
export function nomeParaDownload(
  slugEvento: string,
  indice: number,
  nomeOriginal: string | null
): string {
  const base = nomeOriginal?.replace(/\.[^.]+$/, '')
  return `${slugEvento}-${String(indice + 1).padStart(3, '0')}${base ? `-${base}` : ''}.webp`
}

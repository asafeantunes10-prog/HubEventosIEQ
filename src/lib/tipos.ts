/**
 * Os tipos que atravessam a fronteira entre as Functions e a tela.
 *
 * As colunas do D1 sao `snake_case` (convencao de SQL) e aqui viram `camelCase`
 * (convencao de TypeScript). A traducao acontece num lugar so — no cliente da
 * API, em `api.ts` — para que nenhuma tela precise saber o nome da coluna.
 */

export type StatusEvento = 'rascunho' | 'publicado'
export type LayoutEvento = 'mosaico' | 'uniforme'

export type Foto = {
  id: string
  eventoId: string
  /**
   * `culto-jovens-2026/a1b2` — SEM sufixo de tamanho e SEM extensao. Quem
   * completa e `urlFoto()`, o unico lugar que sabe de onde vem uma foto.
   */
  caminho: string
  nomeOriginal: string | null
  /** Dimensoes da versao grande. Reservam o espaco na grade e evitam pulo. */
  largura: number | null
  altura: number | null
  /** Miniatura de 20px em base64, embutida no JSON — nao custa requisicao. */
  lqip: string | null
  ordem: number
}

export type Evento = {
  id: string
  /** Tambem e o nome da pasta em `fotos/` e o endereco em `/e/:slug`. */
  slug: string
  titulo: string
  descricao: string | null
  /** AAAA-MM-DD. Texto, e nao Date, porque e uma data de calendario sem fuso. */
  dataEvento: string | null
  capaId: string | null
  status: StatusEvento
  /** `false` esconde da home; o link direto continua funcionando. */
  listado: boolean
  destaque: boolean
  permiteZip: boolean
  /** Hex; sobrescreve `--primary` so na pagina deste evento. */
  corDestaque: string | null
  layout: LayoutEvento
  /**
   * `true` quando as versoes grandes foram apagadas para liberar arquivos. A
   * grade continua de pe pelas miniaturas; o que some e o download.
   */
  arquivado: boolean
  totalFotos: number
}

export type EventoComFotos = {
  evento: Evento
  fotos: Foto[]
}

/**
 * Um evento com a imagem de capa ja resolvida — o que a home precisa para
 * desenhar o cartao sem uma segunda ida ao banco.
 *
 * `capa` vem de `capa_id` quando o evento tem uma escolhida, ou da primeira
 * foto (menor `ordem`) quando ninguem escolheu ainda. `null` so acontece num
 * evento publicado sem nenhuma foto — caso raro, mas possivel entre criar o
 * evento e rodar o primeiro `npm run publicar`.
 */
export type EventoComCapa = Evento & {
  capa: Pick<Foto, 'caminho' | 'lqip' | 'largura' | 'altura'> | null
}

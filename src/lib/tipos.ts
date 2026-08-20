/**
 * Os tipos que atravessam a fronteira entre as Functions e a tela.
 *
 * As colunas do D1 sao `snake_case` (convencao de SQL) e aqui viram `camelCase`
 * (convencao de TypeScript). A traducao acontece num lugar so — no cliente da
 * API, em `api.ts` — para que nenhuma tela precise saber o nome da coluna.
 */

export type StatusEvento = 'rascunho' | 'publicado'
export type LayoutEvento = 'mosaico' | 'uniforme'
export type OrdemFotos = 'envio' | 'nome' | 'data'

/** As tres versoes WebP que cada foto tem no R2. */
export type TamanhoFoto = 't' | 'm' | 'g'

export type Foto = {
  id: string
  eventoId: string
  /** Prefixo no R2: `<evento>/<uuid>`. As versoes saem dele com `-t`, `-m`, `-g`. */
  chave: string
  extensao: string
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
  ordemFotos: OrdemFotos
  totalFotos: number
}

/** Um evento com a pagina de fotos ja paginada. */
export type EventoComFotos = {
  evento: Evento
  fotos: Foto[]
  /** Deslocamento da proxima pagina, ou `null` quando acabou. */
  proximo: number | null
}

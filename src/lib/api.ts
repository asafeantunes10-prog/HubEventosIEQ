import type { Evento, EventoComCapa, EventoComFotos, Foto } from '@/lib/tipos'

/**
 * O cliente das Pages Functions.
 *
 * As colunas do D1 sao `snake_case` e vem 0/1 no lugar de booleano — reflexo
 * de como o SQLite guarda as coisas, nao de como a tela deveria pensar nelas.
 * A traducao para os tipos de `tipos.ts` acontece so aqui: nenhuma tela chega
 * a ver o nome de uma coluna ou um `0` que significa `false`.
 */

/**
 * Uma linha de `eventos` como o D1 devolve, antes da traducao.
 *
 * Exportado (junto com `LinhaFoto`, `paraEvento` e `paraFoto` abaixo) para
 * `apiAdmin.ts` reusar a MESMA traducao — o painel le e escreve os mesmos
 * formatos que o site publico le, so que com mais campos visiveis de uma vez.
 */
export type LinhaEvento = {
  id: string
  slug: string
  titulo: string
  descricao: string | null
  data_evento: string | null
  capa_id: string | null
  status: string
  listado: number
  destaque: number
  permite_zip: number
  cor_destaque: string | null
  layout: string
  arquivado: number
  total_fotos: number
}

export type LinhaFoto = {
  id: string
  evento_id: string
  caminho: string
  nome_original: string | null
  largura: number | null
  altura: number | null
  lqip: string | null
  ordem: number
}

export function paraEvento(linha: LinhaEvento): Evento {
  return {
    id: linha.id,
    slug: linha.slug,
    titulo: linha.titulo,
    descricao: linha.descricao,
    dataEvento: linha.data_evento,
    capaId: linha.capa_id,
    status: linha.status as Evento['status'],
    listado: Boolean(linha.listado),
    destaque: Boolean(linha.destaque),
    permiteZip: Boolean(linha.permite_zip),
    corDestaque: linha.cor_destaque,
    layout: linha.layout as Evento['layout'],
    arquivado: Boolean(linha.arquivado),
    totalFotos: linha.total_fotos,
  }
}

export function paraFoto(linha: LinhaFoto): Foto {
  return {
    id: linha.id,
    eventoId: linha.evento_id,
    caminho: linha.caminho,
    nomeOriginal: linha.nome_original,
    largura: linha.largura,
    altura: linha.altura,
    lqip: linha.lqip,
    ordem: linha.ordem,
  }
}

/**
 * Erro com uma mensagem pronta para aparecer na tela, em portugues.
 *
 * Sem propriedade de parametro no construtor (`public status: number` direto
 * na assinatura): o projeto roda com `erasableSyntaxOnly`, que proibe essa
 * forma por ela emitir codigo em vez de ser puramente um tipo apagavel na
 * compilacao.
 */
export class ErroApi extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function buscarJson<T>(caminho: string): Promise<T> {
  const resposta = await fetch(caminho)

  if (!resposta.ok) {
    throw new ErroApi(
      resposta.status === 404
        ? 'Não encontrei esse evento.'
        : 'Não consegui falar com o servidor agora. Tente de novo em instantes.',
      resposta.status
    )
  }

  return resposta.json()
}

export async function listarEventos(): Promise<EventoComCapa[]> {
  const linhas =
    await buscarJson<(LinhaEvento & {
      capa_caminho: string | null
      capa_lqip: string | null
      capa_largura: number | null
      capa_altura: number | null
    })[]>('/api/eventos')

  return linhas.map((linha) => ({
    ...paraEvento(linha),
    capa: linha.capa_caminho
      ? {
          caminho: linha.capa_caminho,
          lqip: linha.capa_lqip,
          largura: linha.capa_largura,
          altura: linha.capa_altura,
        }
      : null,
  }))
}

export async function buscarEvento(slug: string): Promise<EventoComFotos> {
  const dados = await buscarJson<{ evento: LinhaEvento; fotos: LinhaFoto[] }>(
    `/api/eventos/${encodeURIComponent(slug)}`
  )

  return {
    evento: paraEvento(dados.evento),
    fotos: dados.fotos.map(paraFoto),
  }
}

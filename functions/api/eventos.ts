import type { Env } from '../tipos'

/**
 * GET /api/eventos — a lista que a home mostra.
 *
 * So o que esta PUBLICADO e LISTADO: `listado = 0` e o evento "so quem tem o
 * link", que continua acessivel por `/e/:slug` mas nao aparece aqui.
 *
 * A capa vem de duas fontes, na ordem: a foto escolhida em `capa_id`, ou, se
 * ninguem escolheu ainda, a primeira foto do evento (menor `ordem`). Sem esse
 * `coalesce`, todo evento recem-criado apareceria sem imagem na home ate
 * alguem abrir o painel e escolher uma capa.
 *
 * So conta foto `no_ar = 1`: uma registrada e ainda sem deploy apontaria para
 * um arquivo que nao existe, e a home mostraria imagem quebrada.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.BANCO.prepare(
    `select
       e.id, e.slug, e.titulo, e.descricao, e.data_evento, e.status, e.listado,
       e.destaque, e.permite_zip, e.cor_destaque, e.layout, e.arquivado, e.total_fotos,
       coalesce(capa.caminho, primeira.caminho)   as capa_caminho,
       coalesce(capa.lqip, primeira.lqip)         as capa_lqip,
       coalesce(capa.largura, primeira.largura)   as capa_largura,
       coalesce(capa.altura, primeira.altura)     as capa_altura
     from eventos e
     left join fotos capa on capa.id = e.capa_id and capa.no_ar = 1
     left join fotos primeira
       on primeira.evento_id = e.id
      and primeira.no_ar = 1
      and primeira.ordem = (select min(ordem) from fotos where evento_id = e.id and no_ar = 1)
     where e.status = 'publicado' and e.listado = 1
     order by e.destaque desc, e.data_evento desc`
  ).all()

  return Response.json(results, {
    // Curto de proposito: a home muda quando alguem publica um evento, nao a
    // cada minuto, mas nao ha por que bater no D1 a cada F5 da mesma pessoa.
    headers: { 'cache-control': 'public, max-age=60' },
  })
}

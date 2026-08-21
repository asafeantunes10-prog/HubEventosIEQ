import type { Env } from '../../tipos'

/**
 * GET /api/eventos/:slug — um evento e todas as suas fotos.
 *
 * So `status = 'publicado'` responde. Um rascunho devolve 404 mesmo para quem
 * tem o link direto: enquanto o painel (etapa 5) nao existe, e o que impede um
 * evento ainda sendo processado de vazar antes da hora.
 *
 * `listado` NAO entra no filtro — e o contrario de `status`. Um evento
 * `listado = 0` continua respondendo aqui; ele so nao aparece na lista de
 * `eventos.ts`. E assim que "so quem tem o link" funciona.
 *
 * Sem paginacao de proposito: as fotos sao arquivos estaticos, entao nao ha
 * quota de requisicao para economizar despejando 500 registros JSON de uma vez
 * (isso pesava quando a leitura passava por uma Function com R2 atras; aqui a
 * unica coisa que pesa e o tamanho da resposta, e 500 fotos com LQIP de 20px
 * ainda cabem bem abaixo de 1 MB).
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const slug = params.slug

  if (typeof slug !== 'string') {
    return Response.json({ erro: 'Endereco invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare(
    `select id, slug, titulo, descricao, data_evento, capa_id, status, listado,
            destaque, permite_zip, cor_destaque, layout, arquivado, total_fotos
     from eventos where slug = ?1 and status = 'publicado'`
  )
    .bind(slug)
    .first()

  if (!evento) {
    return Response.json({ erro: 'Nao encontrei esse evento.' }, { status: 404 })
  }

  const { results: fotos } = await env.BANCO.prepare(
    `select id, evento_id, caminho, nome_original, largura, altura, lqip, ordem
     from fotos where evento_id = ?1 order by ordem`
  )
    .bind(evento.id)
    .all()

  return Response.json(
    { evento, fotos },
    { headers: { 'cache-control': 'public, max-age=60' } }
  )
}

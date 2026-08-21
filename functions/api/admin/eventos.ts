import type { Env } from '../../tipos'

/**
 * GET /api/admin/eventos — lista TODOS os eventos, qualquer status.
 *
 * Diferente de `api/eventos.ts` (a lista publica): aqui entra rascunho,
 * despublicado, tudo — e a tela de admin precisa ver o que ainda nao foi ao
 * ar para poder public-lo. A capa usa o mesmo `coalesce` da lista publica,
 * para o cartao do admin nao ficar sem imagem enquanto ninguem escolheu uma.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.BANCO.prepare(
    `select
       e.id, e.slug, e.titulo, e.descricao, e.data_evento, e.status, e.listado,
       e.destaque, e.permite_zip, e.cor_destaque, e.layout, e.arquivado, e.total_fotos,
       coalesce(capa.caminho, primeira.caminho) as capa_caminho,
       coalesce(capa.lqip, primeira.lqip)       as capa_lqip
     from eventos e
     left join fotos capa on capa.id = e.capa_id
     left join fotos primeira
       on primeira.evento_id = e.id
      and primeira.ordem = (select min(ordem) from fotos where evento_id = e.id)
     order by e.criado_em desc`
  ).all()

  return Response.json(results)
}

/** Letras minusculas, numeros e hifen — o mesmo formato que `scripts/publicar.mjs` gera. */
const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * POST /api/admin/eventos — cria um evento vazio (sem fotos ainda).
 *
 * Serve para preparar a pagina ANTES do `npm run publicar` rodar — titulo,
 * descricao, data, cor. Quando o script publicar fotos com este slug, ele
 * encontra o evento pelo slug (nao cria um segundo) e so acrescenta as fotos.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let corpo: Record<string, unknown>
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  const slug = typeof corpo.slug === 'string' ? corpo.slug.trim() : ''
  const titulo = typeof corpo.titulo === 'string' ? corpo.titulo.trim() : ''

  if (!SLUG_VALIDO.test(slug)) {
    return Response.json(
      { erro: 'Endereco invalido. Use so letras minusculas, numeros e hifen.' },
      { status: 400 }
    )
  }
  if (!titulo) {
    return Response.json({ erro: 'Titulo e obrigatorio.' }, { status: 400 })
  }

  const existente = await env.BANCO.prepare('select id from eventos where slug = ?1')
    .bind(slug)
    .first()
  if (existente) {
    return Response.json({ erro: `Ja existe um evento com o endereco "${slug}".` }, { status: 409 })
  }

  const id = crypto.randomUUID()

  await env.BANCO.prepare(
    `insert into eventos (id, slug, titulo, descricao, data_evento, cor_destaque, layout)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      id,
      slug,
      titulo,
      typeof corpo.descricao === 'string' && corpo.descricao.trim() ? corpo.descricao.trim() : null,
      typeof corpo.dataEvento === 'string' && corpo.dataEvento ? corpo.dataEvento : null,
      typeof corpo.corDestaque === 'string' && corpo.corDestaque ? corpo.corDestaque : null,
      corpo.layout === 'uniforme' ? 'uniforme' : 'mosaico'
    )
    .run()

  const criado = await env.BANCO.prepare('select * from eventos where id = ?1').bind(id).first()
  return Response.json(criado, { status: 201 })
}

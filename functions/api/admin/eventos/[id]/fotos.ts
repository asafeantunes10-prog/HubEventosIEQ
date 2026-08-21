import type { Env } from '../../../../tipos'

/**
 * PATCH /api/admin/eventos/:id/fotos — reordena as fotos do evento.
 *
 * Corpo: `{ ordem: string[] }`, os ids das fotos na ordem nova, do primeiro ao
 * ultimo. Cada id recebe `ordem = indice na lista` — a mesma coluna que
 * `GradeFotos` usa para desenhar a grade.
 *
 * As fotos vivem numa tabela a parte (nao e uma coluna JSON em `eventos`)
 * porque cada uma tem seu proprio `caminho`, dimensoes e LQIP — reordenar e so
 * um UPDATE de uma coluna, nao reescrever um documento inteiro.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select id from eventos where id = ?1').bind(id).first()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  let corpo: { ordem?: unknown }
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  if (!Array.isArray(corpo.ordem) || corpo.ordem.some((v) => typeof v !== 'string')) {
    return Response.json({ erro: '"ordem" precisa ser uma lista de identificadores.' }, { status: 400 })
  }
  const novaOrdem = corpo.ordem as string[]

  const { results: existentes } = await env.BANCO.prepare(
    'select id from fotos where evento_id = ?1'
  )
    .bind(id)
    .all<{ id: string }>()

  /*
    A lista enviada precisa ser EXATAMENTE o conjunto de fotos do evento — nem
    a mais (um id de outro evento, aceito por engano, moveria uma foto errada)
    nem a menos (uma foto esquecida ficaria com a `ordem` antiga, fora de
    sincronia com as demais).
  */
  const idsExistentes = new Set(existentes.map((f) => f.id))
  const idsEnviados = new Set(novaOrdem)

  const mesmoConjunto =
    idsExistentes.size === idsEnviados.size &&
    novaOrdem.every((idFoto) => idsExistentes.has(idFoto))

  if (!mesmoConjunto) {
    return Response.json(
      { erro: 'A lista enviada nao corresponde as fotos deste evento.' },
      { status: 400 }
    )
  }

  /*
    Um UPDATE por foto, em lote (`batch`). O D1 executa o lote como uma
    transacao: ou todas as posicoes mudam, ou nenhuma — uma queda no meio nunca
    deixa a galeria com duas fotos na mesma `ordem`.
  */
  await env.BANCO.batch(
    novaOrdem.map((idFoto, indice) =>
      env.BANCO.prepare('update fotos set ordem = ?1 where id = ?2').bind(indice, idFoto)
    )
  )

  return new Response(null, { status: 204 })
}

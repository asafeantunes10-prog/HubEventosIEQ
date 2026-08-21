import type { Env } from '../../../tipos'

/** GET /api/admin/eventos/:id — o evento e todas as suas fotos, para a tela de edicao. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select * from eventos where id = ?1').bind(id).first()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  const { results: fotos } = await env.BANCO.prepare(
    'select * from fotos where evento_id = ?1 order by ordem'
  )
    .bind(id)
    .all()

  return Response.json({ evento, fotos })
}

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/
const COR_VALIDA = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Monta a coluna e o valor para UM campo do corpo da requisicao, ou `null`
 * quando o campo nao veio (para o PATCH so tocar no que a tela realmente
 * mandou) ou quando o valor e invalido (para o chamador decidir o que fazer).
 *
 * Devolver `undefined` = "nao apareceu no corpo, nao mexe". Devolver
 * `{ erro }` = "apareceu, mas esta errado". As duas coisas sao diferentes: um
 * PATCH parcial nunca deveria apagar um campo que a tela nem tentou mudar.
 */
type CampoValido = { coluna: string; valor: unknown }
type CampoInvalido = { erro: string }

function lerCampos(corpo: Record<string, unknown>): (CampoValido | CampoInvalido)[] {
  const campos: (CampoValido | CampoInvalido)[] = []

  const bool = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : undefined)

  if ('titulo' in corpo) {
    const v = typeof corpo.titulo === 'string' ? corpo.titulo.trim() : ''
    campos.push(v ? { coluna: 'titulo', valor: v } : { erro: 'Titulo nao pode ficar vazio.' })
  }
  if ('descricao' in corpo) {
    const v = corpo.descricao
    campos.push({
      coluna: 'descricao',
      valor: typeof v === 'string' && v.trim() ? v.trim() : null,
    })
  }
  if ('dataEvento' in corpo) {
    const v = corpo.dataEvento
    if (v === null || v === '') {
      campos.push({ coluna: 'data_evento', valor: null })
    } else if (typeof v === 'string' && DATA_VALIDA.test(v)) {
      campos.push({ coluna: 'data_evento', valor: v })
    } else {
      campos.push({ erro: 'Data invalida — use o formato AAAA-MM-DD.' })
    }
  }
  if ('status' in corpo) {
    const v = corpo.status
    campos.push(
      v === 'rascunho' || v === 'publicado'
        ? { coluna: 'status', valor: v }
        : { erro: 'Status precisa ser "rascunho" ou "publicado".' }
    )
  }
  if ('listado' in corpo) {
    const v = bool(corpo.listado)
    campos.push(v === undefined ? { erro: '"listado" precisa ser verdadeiro ou falso.' } : { coluna: 'listado', valor: v })
  }
  if ('destaque' in corpo) {
    const v = bool(corpo.destaque)
    campos.push(v === undefined ? { erro: '"destaque" precisa ser verdadeiro ou falso.' } : { coluna: 'destaque', valor: v })
  }
  if ('permiteZip' in corpo) {
    const v = bool(corpo.permiteZip)
    campos.push(v === undefined ? { erro: '"permiteZip" precisa ser verdadeiro ou falso.' } : { coluna: 'permite_zip', valor: v })
  }
  if ('arquivado' in corpo) {
    const v = bool(corpo.arquivado)
    campos.push(v === undefined ? { erro: '"arquivado" precisa ser verdadeiro ou falso.' } : { coluna: 'arquivado', valor: v })
  }
  if ('corDestaque' in corpo) {
    const v = corpo.corDestaque
    if (v === null || v === '') {
      campos.push({ coluna: 'cor_destaque', valor: null })
    } else if (typeof v === 'string' && COR_VALIDA.test(v)) {
      campos.push({ coluna: 'cor_destaque', valor: v })
    } else {
      campos.push({ erro: 'Cor invalida — use um hex como #a89c8c.' })
    }
  }
  if ('layout' in corpo) {
    const v = corpo.layout
    campos.push(
      v === 'mosaico' || v === 'uniforme'
        ? { coluna: 'layout', valor: v }
        : { erro: 'Layout precisa ser "mosaico" ou "uniforme".' }
    )
  }
  // `capaId` e tratado a parte em `onRequestPatch`: validar que a foto existe
  // e pertence a ESTE evento exige uma consulta ao banco, que os outros
  // campos nao precisam.

  return campos
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select id from eventos where id = ?1').bind(id).first()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  let corpo: Record<string, unknown>
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  const campos = lerCampos(corpo)

  if ('capaId' in corpo) {
    const capaId = corpo.capaId
    if (capaId === null) {
      campos.push({ coluna: 'capa_id', valor: null })
    } else if (typeof capaId === 'string') {
      const foto = await env.BANCO.prepare('select id from fotos where id = ?1 and evento_id = ?2')
        .bind(capaId, id)
        .first()
      campos.push(
        foto
          ? { coluna: 'capa_id', valor: capaId }
          : { erro: 'Essa foto nao pertence a este evento.' }
      )
    } else {
      campos.push({ erro: '"capaId" precisa ser um texto ou null.' })
    }
  }

  const invalidos = campos.filter((c): c is CampoInvalido => 'erro' in c)
  if (invalidos.length > 0) {
    return Response.json({ erro: invalidos.map((c) => c.erro).join(' ') }, { status: 400 })
  }

  const validos = campos.filter((c): c is CampoValido => 'coluna' in c)
  if (validos.length === 0) {
    return Response.json({ erro: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const atribuicoes = validos.map((c, i) => `${c.coluna} = ?${i + 2}`).join(', ')
  await env.BANCO.prepare(`update eventos set ${atribuicoes} where id = ?1`)
    .bind(id, ...validos.map((c) => c.valor))
    .run()

  const atualizado = await env.BANCO.prepare('select * from eventos where id = ?1').bind(id).first()
  return Response.json(atualizado)
}

/**
 * DELETE /api/admin/eventos/:id
 *
 * Apaga o evento e, em cascata (`on delete cascade` no schema), as linhas de
 * `fotos`. NAO apaga arquivo nenhum: os `.webp` continuam em `fotos/<slug>/`
 * no disco do Asafe e, ate o proximo `npm run publicar` de QUALQUER evento
 * reconstruir e reimplantar o `dist/`, continuam servidos pelo site no ar —
 * `popularDistComFotos()` espelha a pasta `fotos/` inteira, sem olhar o banco.
 *
 * A tela precisa deixar isso claro ANTES de confirmar (ver o dialogo em
 * `PainelEventos.tsx`): "apagar" aqui e apagar o REGISTRO, nao o material.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select id from eventos where id = ?1').bind(id).first()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  await env.BANCO.prepare('delete from eventos where id = ?1').bind(id).run()

  return new Response(null, { status: 204 })
}

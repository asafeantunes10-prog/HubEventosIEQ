import type { Env } from '../../../../tipos'
import { LIMITE_ARQUIVOS } from '../../../../lib/paginasApi'
import { contarArquivos, NO_AR } from '../../../../lib/publicacao'

/** 12 hexa, o mesmo formato que o navegador sorteia ao processar a foto. */
const ID_FOTO = /^[0-9a-f]{12}$/
/** Hash do Pages: 32 primeiros caracteres hexa do blake3. */
const HASH_PAGES = /^[0-9a-f]{32}$/
const LQIP_VALIDO = /^data:image\/webp;base64,[A-Za-z0-9+/=]{1,4000}$/

/** Quantas fotos cabem numa chamada de registro (ou de exclusao). */
const MAXIMO_POR_LOTE = 100

type FotoNova = {
  id: string
  nomeOriginal: string
  chaveOrigem: string
  largura: number
  altura: number
  lqip: string
  hashT: string
  hashG: string
  capturadaEm: string | null
}

const inteiroPositivo = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 30_000

/**
 * Confere UMA foto do corpo. Devolve o motivo da recusa, ou `null` se esta
 * valida. Os campos que entram em nome de arquivo e no manifesto do deploy
 * (`id`, hashes) sao restritos a hexadecimal de proposito: o manifesto e
 * montado concatenando texto no SQL, e so e seguro porque nada alem disso
 * chega la.
 */
function motivoDeRecusa(f: Partial<Record<keyof FotoNova, unknown>>): string | null {
  if (typeof f.id !== 'string' || !ID_FOTO.test(f.id)) return 'id invalido'
  if (typeof f.nomeOriginal !== 'string' || !f.nomeOriginal || f.nomeOriginal.length > 300) {
    return 'nome do arquivo invalido'
  }
  if (typeof f.chaveOrigem !== 'string' || !f.chaveOrigem || f.chaveOrigem.length > 400) {
    return 'chave de origem invalida'
  }
  if (!inteiroPositivo(f.largura) || !inteiroPositivo(f.altura)) return 'dimensoes invalidas'
  if (typeof f.lqip !== 'string' || !LQIP_VALIDO.test(f.lqip)) return 'miniatura borrada invalida'
  if (typeof f.hashT !== 'string' || !HASH_PAGES.test(f.hashT)) return 'hash da miniatura invalido'
  if (typeof f.hashG !== 'string' || !HASH_PAGES.test(f.hashG)) return 'hash da foto invalido'
  if (
    f.capturadaEm !== null &&
    f.capturadaEm !== undefined &&
    (typeof f.capturadaEm !== 'string' || f.capturadaEm.length > 40)
  ) {
    return 'data de captura invalida'
  }
  return null
}

/**
 * POST /api/admin/eventos/:id/fotos — registra um lote de fotos que o navegador
 * ja mandou para o deposito do Pages (`armazenamento/enviar`).
 *
 * Corpo: `{ fotos: FotoNova[] }`, JA NA ORDEM em que devem entrar. Elas nascem
 * com `no_ar = 0`: existem para o painel, mas a galeria publica nao as mostra
 * ate o deploy terminar. Sem esse intervalo protegido, o site apontaria para
 * arquivos que ainda nao existem.
 *
 * Idempotente: repetir o lote (a aba fechou, a rede caiu, o navegador tentou de
 * novo) nao duplica nada, porque `chave_origem` e unica por evento.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select id, slug from eventos where id = ?1')
    .bind(id)
    .first<{ id: string; slug: string }>()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  let corpo: { fotos?: unknown }
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  if (!Array.isArray(corpo.fotos) || corpo.fotos.length === 0) {
    return Response.json({ erro: '"fotos" precisa ser uma lista com ao menos uma foto.' }, { status: 400 })
  }
  if (corpo.fotos.length > MAXIMO_POR_LOTE) {
    return Response.json(
      { erro: `No maximo ${MAXIMO_POR_LOTE} fotos por chamada.` },
      { status: 400 }
    )
  }

  const fotos = corpo.fotos as Partial<Record<keyof FotoNova, unknown>>[]
  for (const [i, f] of fotos.entries()) {
    const motivo = f && typeof f === 'object' ? motivoDeRecusa(f) : 'foto nao e um objeto'
    if (motivo) {
      return Response.json({ erro: `Foto ${i + 1}: ${motivo}.` }, { status: 400 })
    }
  }

  // Cada foto vira dois arquivos. Recusar aqui evita descobrir o estouro so no
  // deploy, depois de o navegador ja ter enviado tudo.
  const arquivosAtuais = await contarArquivos(env.BANCO, true)
  if (arquivosAtuais + fotos.length * 2 > LIMITE_ARQUIVOS) {
    return Response.json(
      {
        erro:
          `Nao cabe: o site tem ${arquivosAtuais.toLocaleString('pt-BR')} de ` +
          `${LIMITE_ARQUIVOS.toLocaleString('pt-BR')} arquivos. Arquive eventos antigos.`,
      },
      { status: 409 }
    )
  }

  /*
    `ordem` sai de um subselect: o D1 roda o lote em ordem, entao cada insert
    enxerga o anterior e a numeracao continua sem buraco. `or ignore` e o que
    torna o lote repetivel (indice unico em `chave_origem`).
  */
  const resultados = await env.BANCO.batch(
    (fotos as unknown as FotoNova[]).map((f) =>
      env.BANCO.prepare(
        `insert or ignore into fotos
           (id, evento_id, caminho, nome_original, largura, altura, lqip, ordem,
            hash_t, hash_g, no_ar, chave_origem, capturada_em)
         values
           (?1, ?2, ?3, ?4, ?5, ?6, ?7,
            (select coalesce(max(ordem), -1) + 1 from fotos where evento_id = ?2),
            ?8, ?9, ${NO_AR.pendente}, ?10, ?11)`
      ).bind(
        f.id,
        evento.id,
        `${evento.slug}/${f.id}`,
        f.nomeOriginal,
        f.largura,
        f.altura,
        f.lqip,
        f.hashT,
        f.hashG,
        f.chaveOrigem,
        f.capturadaEm ?? null
      )
    )
  )

  const registradas = resultados.reduce((soma, r) => soma + (r.meta.changes ?? 0), 0)

  return Response.json({ registradas, jaExistiam: fotos.length - registradas })
}

/**
 * DELETE /api/admin/eventos/:id/fotos — apaga fotos do evento.
 *
 * Corpo: `{ ids: string[] }`. Tira a foto do banco e, se ela era a capa, volta a
 * capa para o automatico. O ARQUIVO continua no ar ate o proximo deploy: depois
 * de apagar, o navegador chama `armazenamento/publicar`, que reconstroi o
 * manifesto sem elas.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id
  if (typeof id !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const evento = await env.BANCO.prepare('select id from eventos where id = ?1').bind(id).first()
  if (!evento) {
    return Response.json({ erro: 'Evento nao encontrado.' }, { status: 404 })
  }

  let corpo: { ids?: unknown }
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  if (
    !Array.isArray(corpo.ids) ||
    corpo.ids.length === 0 ||
    corpo.ids.length > MAXIMO_POR_LOTE ||
    corpo.ids.some((v) => typeof v !== 'string' || !ID_FOTO.test(v))
  ) {
    return Response.json(
      { erro: `"ids" precisa ser uma lista de 1 a ${MAXIMO_POR_LOTE} identificadores.` },
      { status: 400 }
    )
  }
  const ids = corpo.ids as string[]

  const resultados = await env.BANCO.batch([
    // A capa primeiro: depois do delete a foto nao existe mais para conferir.
    ...ids.map((idFoto) =>
      env.BANCO.prepare('update eventos set capa_id = null where id = ?1 and capa_id = ?2').bind(
        id,
        idFoto
      )
    ),
    ...ids.map((idFoto) =>
      env.BANCO.prepare('delete from fotos where id = ?1 and evento_id = ?2').bind(idFoto, id)
    ),
  ])

  // So os DELETEs (a segunda metade do lote) contam como foto apagada.
  const apagadas = resultados
    .slice(ids.length)
    .reduce((soma, r) => soma + (r.meta.changes ?? 0), 0)

  return Response.json({ apagadas })
}

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

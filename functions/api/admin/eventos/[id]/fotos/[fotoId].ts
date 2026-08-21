import type { Env } from '../../../../../tipos'

/**
 * DELETE /api/admin/eventos/:id/fotos/:fotoId
 *
 * Apaga o REGISTRO de uma foto: a linha em `fotos`, a capa do evento se era
 * esta a foto escolhida, e recalcula `total_fotos`. NAO apaga o arquivo
 * `.webp` do disco nem do site publicado — mesma ressalva do DELETE de evento
 * em `eventos/[id].ts`: os arquivos ficam orfaos ate o proximo
 * `npm run publicar` (de QUALQUER evento) rodar `limparOrfaos()` e reconstruir
 * o `dist/`. Ate la a foto some da galeria (a Function le o D1, nao o disco),
 * mas o arquivo continua contando para o teto de 20.000 do site.
 *
 * Existe para corrigir engano: uma foto que entrou errada num
 * `npm run publicar`, ou um teste que nao devia ter ficado no banco de
 * verdade. Nao e "curadoria" — selecionar o que fica e o que sai e trabalho de
 * quem tira a foto, nao do hub.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = params.id
  const fotoId = params.fotoId
  if (typeof id !== 'string' || typeof fotoId !== 'string') {
    return Response.json({ erro: 'Identificador invalido.' }, { status: 400 })
  }

  const foto = await env.BANCO.prepare('select id from fotos where id = ?1 and evento_id = ?2')
    .bind(fotoId, id)
    .first()
  if (!foto) {
    return Response.json({ erro: 'Foto nao encontrada neste evento.' }, { status: 404 })
  }

  /*
    Um lote so (`batch` = transacao no D1, executada em ordem): apaga a linha,
    tira a foto da capa se era ela (a coluna `capa_id` nao tem FK — ninguem
    limparia isso sozinho), e recalcula `total_fotos` de uma CONTAGEM REAL,
    nunca um acumulador — mesmo motivo de `atualizarTotal` em
    `scripts/publicar.mjs`. A contagem roda depois do DELETE no mesmo lote,
    entao ja nao ve a linha apagada.
  */
  await env.BANCO.batch([
    env.BANCO.prepare('delete from fotos where id = ?1').bind(fotoId),
    env.BANCO.prepare('update eventos set capa_id = null where id = ?1 and capa_id = ?2').bind(
      id,
      fotoId
    ),
    env.BANCO.prepare(
      'update eventos set total_fotos = (select count(*) from fotos where evento_id = ?1) where id = ?1'
    ).bind(id),
  ])

  return new Response(null, { status: 204 })
}

import type { Env } from '../../../tipos'
import {
  armazenamentoConfigurado,
  criarDeployment,
  ErroPaginas,
  LIMITE_ARQUIVOS,
  registrarHashes,
  RESPOSTA_NAO_CONFIGURADO,
} from '../../../lib/paginasApi'
import {
  devolverParaFila,
  fotosSemHash,
  montarManifesto,
  NO_AR,
  reconciliar,
} from '../../../lib/publicacao'

/**
 * Quanto esperar o deploy terminar antes de devolver a resposta. Um deploy
 * direto leva alguns segundos; se passar disto o navegador continua perguntando
 * em `estado` — nada se perde. O limite existe porque cada consulta e um
 * subrequest e uma Function tem 50 por chamada.
 */
const TENTATIVAS = 10
const INTERVALO_MS = 2000

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * POST /api/admin/armazenamento/publicar — poe no ar tudo que esta na fila.
 *
 * Cria um deployment do projeto de fotos com TODOS os arquivos que devem existir
 * (os que ja estavam + os novos). Um deploy do Pages SUBSTITUI o site anterior:
 * o que faltar no manifesto some do ar. Por isso tres cuidados:
 *
 *   1. Recusa se alguma foto no ar nao tem hash — ela sumiria em silencio.
 *   2. Monta o manifesto sempre do banco, a unica fonte da verdade.
 *   3. So marca as fotos como "no ar" DEPOIS de o deploy terminar, para a
 *      galeria publica nunca apontar para arquivo que ainda nao existe.
 *
 * Tambem e este o caminho de quem apagou foto ou arquivou um evento: o banco
 * ja mudou, e o deploy leva o ar a ficar igual a ele.
 */
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  if (!armazenamentoConfigurado(env)) return RESPOSTA_NAO_CONFIGURADO()

  const semHash = await fotosSemHash(env.BANCO)
  if (semHash > 0) {
    return Response.json(
      {
        erro:
          `${semHash} foto(s) que ja estao no ar ainda nao tem hash. Publicar agora as apagaria ` +
          'do site. Rode a migracao das fotos antes (npm run migrar-fotos).',
      },
      { status: 409 }
    )
  }

  // Reserva as pendentes: elas entram neste deploy, e so viram "no ar" quando
  // ele terminar.
  await env.BANCO.prepare(
    `update fotos set no_ar = ${NO_AR.emPublicacao} where no_ar = ${NO_AR.pendente}`
  ).run()

  try {
    const manifesto = await montarManifesto(env.BANCO)

    if (manifesto.arquivos === 0) {
      await devolverParaFila(env.BANCO)
      return Response.json({ erro: 'Nao ha nenhuma foto para publicar.' }, { status: 409 })
    }
    if (manifesto.arquivos > LIMITE_ARQUIVOS) {
      await devolverParaFila(env.BANCO)
      return Response.json(
        {
          erro:
            `O site passaria a ter ${manifesto.arquivos.toLocaleString('pt-BR')} arquivos e o ` +
            `limite e ${LIMITE_ARQUIVOS.toLocaleString('pt-BR')}. Arquive eventos antigos primeiro.`,
        },
        { status: 409 }
      )
    }

    await registrarHashes(env, manifesto.hashes)
    const deployment = await criarDeployment(env, manifesto.manifesto)

    let situacao = await reconciliar(env, deployment.id)
    for (let i = 0; i < TENTATIVAS && situacao === 'andamento'; i++) {
      await espera(INTERVALO_MS)
      situacao = await reconciliar(env, deployment.id)
    }

    return Response.json({
      deploymentId: deployment.id,
      situacao,
      arquivos: manifesto.arquivos,
    })
  } catch (e) {
    await devolverParaFila(env.BANCO)
    if (e instanceof ErroPaginas) {
      return Response.json({ erro: e.message }, { status: 502 })
    }
    throw e
  }
}

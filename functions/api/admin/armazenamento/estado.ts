import type { Env } from '../../../tipos'
import {
  armazenamentoConfigurado,
  ErroPaginas,
  LIMITE_ARQUIVOS,
  RESPOSTA_NAO_CONFIGURADO,
} from '../../../lib/paginasApi'
import { contarArquivos, NO_AR, reconciliar } from '../../../lib/publicacao'

/**
 * GET /api/admin/armazenamento/estado[?deployment=<id>]
 *
 * Responde a duas perguntas da tela de envio:
 *   - quanto do limite de arquivos ja foi usado, e quantas fotos esperam deploy;
 *   - se o deploy que o navegador acabou de pedir ja terminou.
 *
 * Com `deployment`, consulta o Pages e ACERTA o banco se ele terminou (ver
 * `reconciliar`): e como um deploy que passou do tempo de espera do `publicar`
 * ainda assim chega ao fim, sem depender de o navegador continuar aberto na
 * mesma chamada.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!armazenamentoConfigurado(env)) return RESPOSTA_NAO_CONFIGURADO()

  const deploymentId = new URL(request.url).searchParams.get('deployment')

  let situacao: string | null = null
  if (deploymentId) {
    try {
      situacao = await reconciliar(env, deploymentId)
    } catch (e) {
      if (e instanceof ErroPaginas) {
        return Response.json({ erro: e.message }, { status: 502 })
      }
      throw e
    }
  }

  const pendentes = await env.BANCO.prepare(
    `select count(*) as n from fotos where no_ar in (${NO_AR.pendente}, ${NO_AR.emPublicacao})`
  ).first<{ n: number }>()

  return Response.json({
    situacao,
    arquivos: await contarArquivos(env.BANCO, true),
    limite: LIMITE_ARQUIVOS,
    pendentes: pendentes?.n ?? 0,
  })
}

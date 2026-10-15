import type { Env } from '../../../tipos'
import {
  armazenamentoConfigurado,
  ErroPaginas,
  repassarUpload,
  RESPOSTA_NAO_CONFIGURADO,
} from '../../../lib/paginasApi'

/**
 * Um lote cabe com folga: a API do Pages aceita ~40 MB por requisicao (e o que
 * o wrangler usa), e 30 MB deixa margem para o cabecalho e para o base64.
 */
const LIMITE_BYTES = 30 * 1024 * 1024

/**
 * POST /api/admin/armazenamento/enviar — manda um lote de arquivos para o
 * projeto de fotos.
 *
 * O NAVEGADOR nao fala direto com a API do Cloudflare: ela nao libera CORS. Esta
 * rota e so o atravessador, e o corpo passa em fluxo, sem ser lido (ver
 * `repassarUpload`). Os arquivos ainda NAO estao no ar depois disto — so no
 * deposito da Cloudflare; quem poe no ar e o `publicar`.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!armazenamentoConfigurado(env)) return RESPOSTA_NAO_CONFIGURADO()

  const tamanho = request.headers.get('content-length')
  if (!tamanho || !/^\d+$/.test(tamanho)) {
    return Response.json({ erro: 'O envio precisa informar o tamanho.' }, { status: 411 })
  }
  if (Number(tamanho) > LIMITE_BYTES) {
    return Response.json({ erro: 'Lote grande demais; mande menos fotos por vez.' }, { status: 413 })
  }
  if (!request.body) {
    return Response.json({ erro: 'Envio vazio.' }, { status: 400 })
  }

  try {
    await repassarUpload(env, request.body, tamanho)
  } catch (e) {
    if (e instanceof ErroPaginas) {
      return Response.json({ erro: e.message }, { status: 502 })
    }
    throw e
  }

  return new Response(null, { status: 204 })
}

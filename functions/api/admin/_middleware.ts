import type { Env } from '../../tipos'
import { sessaoValida } from '../../lib/sessao'

/**
 * Protege TUDO em `/api/admin/*` com a sessao de login — ver `api/login.ts`.
 *
 * O Cloudflare Access foi descartado: criar a equipe no Zero Trust pede
 * cartao de credito mesmo escolhendo o plano gratuito (confirmado na pratica
 * pelo Asafe) — o mesmo motivo que tirou o R2 do projeto. A alternativa e
 * uma senha unica: hash PBKDF2 guardado como SECRET (nunca em texto puro,
 * nunca no wrangler.toml, nunca no git) e uma sessao assinada por HMAC.
 *
 * FECHADO POR PADRAO. Sem `SESSAO_SEGREDO` configurado, NENHUMA requisicao
 * passa — nem para testar, nem por engano. E a diferenca entre "a porta esta
 * trancada" e "a porta ainda nem existe": so a segunda seria insegura.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  if (!env.SESSAO_SEGREDO) {
    return Response.json(
      { erro: 'O login do painel ainda nao foi configurado (falta SESSAO_SEGREDO).' },
      { status: 503 }
    )
  }

  if (!(await sessaoValida(request, env.SESSAO_SEGREDO))) {
    return Response.json({ erro: 'Sessao invalida ou expirada. Faca login de novo.' }, { status: 401 })
  }

  return next()
}

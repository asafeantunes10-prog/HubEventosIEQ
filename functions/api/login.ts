import type { Env } from '../tipos'
import { verificarSenha } from '../lib/senha'
import { criarCookieSessao } from '../lib/sessao'

/** Uma janela de 15 minutos, 10 tentativas erradas — depois disso, espera. */
const JANELA_SEGUNDOS = 15 * 60
const LIMITE_TENTATIVAS = 10

/**
 * POST /api/login — a unica porta de entrada do painel.
 *
 * O limitador por IP mora aqui, e nao no Cloudflare Access, porque o Access
 * foi descartado (pede cartao mesmo no plano gratuito — mesmo motivo do R2).
 * Sem ele, um script tentando senhas em sequencia so encontra dois freios:
 * o custo do PBKDF2 (modesto de proposito, ver `lib/senha.ts`) e este limite,
 * guardado no D1 porque o projeto ja tem o banco e nao precisa de mais nada.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SENHA_HASH || !env.SESSAO_SEGREDO) {
    return Response.json({ erro: 'O login do painel ainda nao foi configurado.' }, { status: 503 })
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'desconhecido'
  const agora = Math.floor(Date.now() / 1000)

  const tentativa = await env.BANCO.prepare(
    'select contagem, expira_em from tentativas_login where chave = ?1'
  )
    .bind(ip)
    .first<{ contagem: number; expira_em: number }>()

  const bloqueado = Boolean(tentativa) && tentativa!.expira_em > agora && tentativa!.contagem >= LIMITE_TENTATIVAS
  if (bloqueado) {
    return Response.json({ erro: 'Muitas tentativas erradas. Espere alguns minutos.' }, { status: 429 })
  }

  let corpo: { senha?: unknown }
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo da requisicao nao e um JSON valido.' }, { status: 400 })
  }

  const senha = typeof corpo.senha === 'string' ? corpo.senha : ''
  const ok = senha.length > 0 && (await verificarSenha(senha, env.SENHA_HASH))

  if (!ok) {
    /*
      Janela em curso: soma mais uma tentativa. Janela vencida ou inexistente:
      comeca uma nova do zero — sem isto, um IP que errou ha 3 horas e tentou
      de novo agora entraria com a contagem antiga e seria bloqueado sem nunca
      ter passado do limite NESTA janela.
    */
    if (tentativa && tentativa.expira_em > agora) {
      await env.BANCO.prepare('update tentativas_login set contagem = contagem + 1 where chave = ?1')
        .bind(ip)
        .run()
    } else {
      await env.BANCO.prepare(
        `insert into tentativas_login (chave, contagem, expira_em) values (?1, 1, ?2)
         on conflict(chave) do update set contagem = 1, expira_em = ?2`
      )
        .bind(ip, agora + JANELA_SEGUNDOS)
        .run()
    }

    return Response.json({ erro: 'Senha incorreta.' }, { status: 401 })
  }

  // Acertou: zera o contador desta chave e entrega o cookie de sessao.
  await env.BANCO.prepare('delete from tentativas_login where chave = ?1').bind(ip).run()

  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': await criarCookieSessao(env.SESSAO_SEGREDO) },
  })
}

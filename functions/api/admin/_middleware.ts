import type { Env } from '../../tipos'

/**
 * Protege TUDO em `/api/admin/*`.
 *
 * "Isso é o que protege de verdade — esconder o botão no site não é
 * segurança" (PLANO.md). O Cloudflare Access barra `/admin` no navegador antes
 * da pagina carregar, mas isso sozinho nao protege a API: alguem que descobrir
 * o endereco de uma rota (`/api/admin/eventos`, por exemplo) poderia chamar
 * direto, sem passar pelo login. Este middleware valida, em toda requisicao,
 * o JWT que o Access injeta no cabecalho `Cf-Access-Jwt-Assertion` DEPOIS de
 * um login bem-sucedido — contra as chaves publicas da propria Cloudflare.
 *
 * FECHADO POR PADRAO. `ACESSO_DOMINIO` e `ACESSO_AUD` (`wrangler.toml`) ficam
 * vazios ate o Asafe criar a equipe no Access e a aplicacao para `/admin`. Sem
 * os dois, NENHUMA requisicao passa — nem para testar, nem por engano. E a
 * diferenca entre "a porta esta trancada" e "a porta ainda nem existe": so a
 * segunda seria insegura, e o codigo nunca chega la sem as variaveis.
 *
 * QUALQUER falha na validacao (rede fora do ar buscando as chaves, token mal
 * formado, assinatura que nao bate, claim que nao confere) tem que fechar a
 * porta. Isto e verificado por um `try/catch` que so tem um destino de erro:
 * 403. Nunca "passa direto" quando algo da errado.
 *
 * NAO TESTADO CONTRA UM ACCESS DE VERDADE AINDA — nao ha como, sem a equipe
 * criada. Ver a nota completa no CLAUDE.md antes de confiar cegamente nisto em
 * producao: depois que o Asafe preencher as duas variaveis, vale abrir
 * `/admin` deslogado (tem que barrar) e checar os logs de uma Function se
 * algo parecer errado.
 */

type ChaveJwks = JsonWebKey & { kid?: string }

let certificadosEmCache: { chaves: ChaveJwks[]; expiraEm: number } | null = null

/** As chaves publicas do Access raramente giram; uma hora de cache poupa uma busca por requisicao. */
const TTL_CERTIFICADOS_MS = 60 * 60 * 1000

async function buscarCertificados(dominio: string): Promise<ChaveJwks[]> {
  const agora = Date.now()
  if (certificadosEmCache && certificadosEmCache.expiraEm > agora) {
    return certificadosEmCache.chaves
  }

  const resposta = await fetch(`https://${dominio}/cdn-cgi/access/certs`)
  if (!resposta.ok) {
    throw new Error(`Nao consegui buscar os certificados do Access (${resposta.status}).`)
  }

  const corpo = (await resposta.json()) as { keys?: ChaveJwks[] }
  if (!Array.isArray(corpo.keys) || corpo.keys.length === 0) {
    throw new Error('O Access nao devolveu nenhuma chave publica.')
  }

  certificadosEmCache = { chaves: corpo.keys, expiraEm: agora + TTL_CERTIFICADOS_MS }
  return corpo.keys
}

function base64UrlParaBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

function decodificarJson(base64Url: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlParaBytes(base64Url)))
}

/**
 * Confere a assinatura RS256 do JWT contra a chave publica correspondente.
 *
 * So depois de PASSAR AQUI e que o conteudo do token merece confianca — antes
 * disso, `header`/`payload` sao so o que veio escrito, e qualquer um monta um
 * JWT com o `payload` que quiser.
 */
async function assinaturaValida(jwt: string, jwk: ChaveJwks): Promise<boolean> {
  const [headerB64, payloadB64, assinaturaB64] = jwt.split('.')

  const chave = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chave,
    base64UrlParaBytes(assinaturaB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  )
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const dominio = env.ACESSO_DOMINIO
  const aud = env.ACESSO_AUD

  if (!dominio || !aud) {
    return Response.json(
      {
        erro:
          'O painel administrativo ainda nao foi protegido pelo Cloudflare Access. ' +
          'ACESSO_DOMINIO e ACESSO_AUD precisam ser configurados no wrangler.toml.',
      },
      { status: 503 }
    )
  }

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!jwt) {
    return Response.json({ erro: 'Sem autenticacao.' }, { status: 401 })
  }

  try {
    const partes = jwt.split('.')
    if (partes.length !== 3) throw new Error('Token com formato invalido.')

    const cabecalho = decodificarJson(partes[0])
    const payload = decodificarJson(partes[1])

    const chaves = await buscarCertificados(dominio)
    const jwk = chaves.find((k) => k.kid === cabecalho.kid)
    if (!jwk) throw new Error('A chave que assinou este token nao e conhecida.')

    if (!(await assinaturaValida(jwt, jwk))) {
      throw new Error('Assinatura do token invalida.')
    }

    const agora = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < agora) {
      throw new Error('Token expirado.')
    }

    const audiencias = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!audiencias.includes(aud)) {
      throw new Error('Token nao pertence a esta aplicacao.')
    }

    if (payload.iss !== `https://${dominio}`) {
      throw new Error('Emissor do token nao confere.')
    }
  } catch (e) {
    // QUALQUER excecao acima cai aqui, e o destino e sempre o mesmo: barrar.
    return Response.json(
      { erro: e instanceof Error ? e.message : 'Token invalido.' },
      { status: 403 }
    )
  }

  return next()
}

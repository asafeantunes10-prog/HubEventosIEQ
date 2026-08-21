import { base64UrlParaBytes, bytesParaBase64Url } from './base64url'

const NOME_COOKIE = 'sessao_admin'

/**
 * 7 dias. Confortavel para o uso real do painel — publicar um evento, ajustar
 * uma capa — sem pedir senha de novo a cada visita, mas curto o bastante para
 * uma sessao esquecida num computador nao ficar valida para sempre.
 */
const DURACAO_SESSAO_SEGUNDOS = 7 * 24 * 60 * 60

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/**
 * Monta o cabecalho `Set-Cookie` de uma sessao nova.
 *
 * O cookie carrega so `{ exp }`, assinado por HMAC — nao guarda nada alem
 * disso porque so existe UMA identidade aqui (a senha unica do painel, sem
 * conta por pessoa). `HttpOnly` impede que um script no navegador leia o
 * cookie (mitiga XSS); `Secure` exige HTTPS (o Pages so serve por HTTPS
 * mesmo); `SameSite=Strict` impede que outro site induza uma requisicao
 * autenticada em nome de quem esta logado.
 */
export async function criarCookieSessao(segredo: string): Promise<string> {
  const expiraEm = Math.floor(Date.now() / 1000) + DURACAO_SESSAO_SEGUNDOS
  const payload = bytesParaBase64Url(new TextEncoder().encode(JSON.stringify({ exp: expiraEm })))

  const chave = await chaveHmac(segredo)
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(payload))
  const valor = `${payload}.${bytesParaBase64Url(new Uint8Array(assinatura))}`

  return `${NOME_COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACAO_SESSAO_SEGUNDOS}`
}

/** `Max-Age=0` apaga o cookie no navegador — e o que `POST /api/logout` devolve. */
export function cookieDeLogout(): string {
  return `${NOME_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
}

/** Confere a assinatura do cookie e se a sessao ainda nao venceu. */
export async function sessaoValida(request: Request, segredo: string): Promise<boolean> {
  const cookie = lerCookie(request, NOME_COOKIE)
  if (!cookie) return false

  const [payloadB64, assinaturaB64] = cookie.split('.')
  if (!payloadB64 || !assinaturaB64) return false

  const chave = await chaveHmac(segredo)
  const valido = await crypto.subtle.verify(
    'HMAC',
    chave,
    base64UrlParaBytes(assinaturaB64),
    new TextEncoder().encode(payloadB64)
  )
  if (!valido) return false

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(payloadB64))) as {
      exp?: unknown
    }
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function lerCookie(request: Request, nome: string): string | null {
  const cabecalho = request.headers.get('Cookie')
  if (!cabecalho) return null

  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=')
    if (igual === -1) continue
    if (parte.slice(0, igual).trim() === nome) return parte.slice(igual + 1).trim()
  }
  return null
}

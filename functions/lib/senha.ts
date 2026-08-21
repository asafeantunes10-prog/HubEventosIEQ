import { base64UrlParaBytes } from './base64url'

/**
 * Verifica uma senha contra o hash guardado no secret `SENHA_HASH`.
 *
 * PBKDF2-HMAC-SHA256, com o numero de iteracoes guardado DENTRO do proprio
 * hash (formato `pbkdf2:<iteracoes>:<sal>:<hash>`, tudo em base64url) — assim
 * gerar (`scripts/gerar-senha.mjs`) e verificar (aqui) nunca podem discordar
 * sobre quantas iteracoes usar, mesmo que o numero mude no futuro.
 *
 * SO 5.000 ITERACOES, DE PROPOSITO. O teto do plano gratuito das Pages
 * Functions e 10ms de CPU POR REQUISICAO — nao 10ms de relogio, de CPU real.
 * Medido no runtime de verdade (workerd, via `wrangler pages dev`): 5.000
 * iteracoes levam ~4ms; 100.000 levam ~65ms, o que estouraria o teto e
 * derrubaria a propria requisicao de login. E por isso que a SENHA precisa
 * ser longa — a protecao aqui vem do tamanho do espaco de busca, nao do custo
 * de cada tentativa (bem menor do que os milhoes de iteracoes recomendados
 * quando nao existe um teto de CPU). `scripts/gerar-senha.mjs` sorteia uma
 * senha de 20 caracteres por padrao, exatamente por causa disso.
 */
export async function verificarSenha(candidata: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split(':')
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false

  const iteracoes = Number(partes[1])
  if (!Number.isFinite(iteracoes) || iteracoes <= 0) return false

  const salt = base64UrlParaBytes(partes[2])
  const hashEsperado = base64UrlParaBytes(partes[3])

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(candidata),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivado = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteracoes },
      chave,
      hashEsperado.length * 8
    )
  )

  return compararConstante(derivado, hashEsperado)
}

/**
 * Compara dois arrays byte a byte SEM sair mais cedo no primeiro que difere.
 *
 * Um `===`/`every` comum retorna assim que acha a primeira diferenca, e esse
 * atraso muda com QUANTOS bytes iniciais bateram — em teoria, medir o tempo
 * de resposta de varias tentativas deixaria adivinhar a senha byte a byte.
 * Aqui o `|=` percorre o array inteiro sempre, entao o tempo nao vaza essa
 * informacao.
 */
function compararConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i]
  return diferenca === 0
}

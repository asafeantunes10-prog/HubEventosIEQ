/**
 * Gera os dois secrets que o login do painel exige: o hash da senha e a
 * chave de sessao.
 *
 * Uso:
 *   node scripts/gerar-senha.mjs                # sorteia uma senha forte
 *   node scripts/gerar-senha.mjs "minha-senha"   # usa a senha informada
 *
 * MESMO ALGORITMO de `functions/lib/senha.ts` — PBKDF2-HMAC-SHA256, com o
 * numero de iteracoes guardado DENTRO do hash gerado, entao os dois lados
 * nunca podem discordar sobre isso, nem se o numero mudar no futuro.
 *
 * 5.000 ITERACOES, NAO MAIS: e o teto que cabe nos 10ms de CPU do plano
 * gratuito das Pages Functions (medido no runtime real, nao so no Node — ver
 * o comentario completo em `functions/lib/senha.ts`). Por isso a senha
 * sorteada tem 20 caracteres: a protecao aqui vem do tamanho do espaco de
 * busca, nao do custo de cada tentativa.
 *
 * Depois de rodar, os dois comandos impressos gravam os valores na
 * Cloudflare — nunca neste terminal em texto puro para sempre, nunca no git.
 */
import { webcrypto as crypto } from 'node:crypto'

const ITERACOES = 5000
const PROJETO_PAGES = 'eventos-ieq'

function bytesParaBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function hashDaSenha(senha) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(senha),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const derivado = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERACOES },
    chave,
    256
  )
  return `pbkdf2:${ITERACOES}:${bytesParaBase64Url(salt)}:${bytesParaBase64Url(new Uint8Array(derivado))}`
}

/**
 * 20 caracteres, alfabeto sem ambiguos (sem 0/O, 1/l/I) — da para ditar por
 * telefone ou digitar de cabeca sem confundir. 58^20 combinacoes: mesmo
 * tentando mil senhas por segundo, levaria muito mais que a idade do
 * universo para esgotar por forca bruta.
 */
function senhaAleatoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
}

function chaveDeSessao() {
  return bytesParaBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

async function principal() {
  const senhaInformada = process.argv[2]
  const senha = senhaInformada || senhaAleatoria()

  const hash = await hashDaSenha(senha)
  const segredo = chaveDeSessao()

  console.log('\n== Senha do painel ==\n')

  if (senhaInformada) {
    console.log('  Usando a senha informada na linha de comando.\n')
  } else {
    console.log(`  Senha gerada:  ${senha}`)
    console.log('  Guarde isto AGORA num gerenciador de senhas — ela nao aparece de novo.\n')
  }

  console.log('Rode os dois comandos abaixo (cada um pede para colar um valor):\n')
  console.log(`  npx wrangler pages secret put SENHA_HASH --project-name=${PROJETO_PAGES}`)
  console.log(`  > ${hash}\n`)
  console.log(`  npx wrangler pages secret put SESSAO_SEGREDO --project-name=${PROJETO_PAGES}`)
  console.log(`  > ${segredo}\n`)
  console.log('Depois de rodar os dois, publique de novo (npm run publicar) para o login valer.\n')
}

principal()

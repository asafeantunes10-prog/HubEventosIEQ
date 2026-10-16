import { test } from 'node:test'
import assert from 'node:assert/strict'

// O hash que os scripts gravam na Cloudflare tem de ser aceito pelo login do servidor. Os dois
// lados implementam o mesmo algoritmo em arquivos diferentes (scripts/gerar-senha.mjs e
// functions/lib/senha.ts); se um dia discordarem, o painel diz "Senha incorreta" para a senha
// certa e ninguem sabe por que. Este teste pega isso antes do deploy.
import { buildSync } from 'esbuild'
import { hashDaSenha } from '../../scripts/gerar-senha.mjs'

// `senha.ts` importa './base64url' sem extensao (o estilo que o esbuild do wrangler resolve e o
// Node puro nao). Em vez de mexer no codigo de producao para agradar o teste, o teste empacota o
// arquivo REAL com o esbuild — o mesmo que o wrangler usa no deploy — e carrega o resultado.
const empacotado = buildSync({
  entryPoints: [new URL('./senha.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
}).outputFiles[0].text
const { verificarSenha } = (await import(
  'data:text/javascript;base64,' + Buffer.from(empacotado).toString('base64')
)) as { verificarSenha: (candidata: string, hashGuardado: string) => Promise<boolean> }

test('o hash gerado pelo script e aceito pelo login com a senha certa', async () => {
  const hash = await hashDaSenha('uma-senha-de-teste-bem-longa')
  assert.equal(await verificarSenha('uma-senha-de-teste-bem-longa', hash), true)
})

test('a senha errada, ou quase certa, e recusada', async () => {
  const hash = await hashDaSenha('uma-senha-de-teste-bem-longa')
  assert.equal(await verificarSenha('uma-senha-de-teste-bem-longA', hash), false)
  assert.equal(await verificarSenha('', hash), false)
})

test('senhas com acento e espaco funcionam (o teclado do celular as produz)', async () => {
  const senha = 'coração de leão 2026'
  const hash = await hashDaSenha(senha)
  assert.equal(await verificarSenha(senha, hash), true)
})

test('o mesmo texto gera hashes diferentes (sal aleatorio), e os dois valem', async () => {
  const a = await hashDaSenha('repetida-repetida')
  const b = await hashDaSenha('repetida-repetida')
  assert.notEqual(a, b)
  assert.equal(await verificarSenha('repetida-repetida', a), true)
  assert.equal(await verificarSenha('repetida-repetida', b), true)
})

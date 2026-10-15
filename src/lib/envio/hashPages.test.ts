import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

import { bytesParaBase64, hashPages } from './hashPages.ts'

/*
  A REFERENCIA e o `blake3-wasm` que o proprio wrangler usa em `hashFile`
  (node_modules/wrangler/wrangler-dist/cli.js). Se o nosso hash divergir dele,
  o deploy pela API rejeita o manifesto com "arquivo faltando" — e o erro
  aparece so na hora de publicar, longe da causa.
*/
const require = createRequire(import.meta.url)
const blake3Wasm = require('blake3-wasm')

function hashDoWrangler(bytes: Buffer, extensao: string): string {
  return blake3Wasm
    .hash(bytes.toString('base64') + extensao)
    .toString('hex')
    .slice(0, 32)
}

test('o hash bate com o do wrangler, para varios tamanhos', async () => {
  for (const tamanho of [0, 1, 3, 100, 32767, 32768, 32769, 500_000]) {
    const bytes = randomBytes(tamanho)
    const nosso = await hashPages(bytesParaBase64(new Uint8Array(bytes)), 'webp')
    assert.equal(nosso, hashDoWrangler(bytes, 'webp'), `${tamanho} bytes`)
    assert.equal(nosso.length, 32)
  }
})

test('a extensao entra no hash', async () => {
  const b64 = bytesParaBase64(new Uint8Array([1, 2, 3]))
  assert.notEqual(await hashPages(b64, 'webp'), await hashPages(b64, 'png'))
})

test('base64 igual ao do Node, inclusive acima do pedaco de 32 KB', () => {
  const bytes = randomBytes(100_000)
  assert.equal(bytesParaBase64(new Uint8Array(bytes)), bytes.toString('base64'))
})

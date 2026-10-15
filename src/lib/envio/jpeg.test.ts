import { test } from 'node:test'
import assert from 'node:assert/strict'

import { jpegIncompleto, pareceJpeg, terminaComEoi } from './jpeg.ts'

const jpegCompleto = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

test('reconhece o comeco de um JPEG', () => {
  assert.equal(pareceJpeg(jpegCompleto), true)
  assert.equal(pareceJpeg(new Uint8Array([0x89, 0x50])), false) // PNG
  assert.equal(pareceJpeg(new Uint8Array([0xff])), false)
})

test('um JPEG que termina em FFD9 esta completo', () => {
  assert.equal(terminaComEoi(jpegCompleto), true)
})

test('zeros depois do EOI (camera) nao atrapalham', () => {
  const comZeros = new Uint8Array([...jpegCompleto, 0, 0, 0, 0])
  assert.equal(terminaComEoi(comZeros), true)
})

test('um JPEG cortado no meio nao tem EOI', () => {
  assert.equal(terminaComEoi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])), false)
})

test('FF 00 (escape de dados) nao conta como fim', () => {
  assert.equal(terminaComEoi(new Uint8Array([0xff, 0x00, 0xff, 0x00])), false)
})

test('jpegIncompleto: completo, cortado, e outro formato', async () => {
  assert.equal(await jpegIncompleto(new Blob([jpegCompleto])), false)
  assert.equal(await jpegIncompleto(new Blob([jpegCompleto.subarray(0, 6)])), true)
  // PNG nao e julgado por esta regra.
  assert.equal(await jpegIncompleto(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])])), false)
})

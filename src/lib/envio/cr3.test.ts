import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { BYTES_PARA_CR3, ehCr3, horaDoCr3 } from './cr3.ts'

/** Monta um CR3 minimo: `ftypcrx ` + uma caixa CMT2 com um TIFF que so tem DateTimeOriginal. */
function cr3Sintetico(data: string, pequeno = true): Uint8Array {
  const tiff = new Uint8Array(8 + 2 + 12 + 4 + 20)
  const v = new DataView(tiff.buffer)
  tiff.set(pequeno ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a])
  v.setUint32(4, 8, pequeno) // IFD logo apos o cabecalho
  v.setUint16(8, 1, pequeno) // uma entrada
  v.setUint16(10, 0x9003, pequeno) // DateTimeOriginal
  v.setUint16(12, 2, pequeno) // ASCII
  v.setUint32(14, 20, pequeno) // 20 caracteres
  v.setUint32(18, 8 + 2 + 12 + 4, pequeno) // deslocamento dos dados
  tiff.set(Array.from(data, (c) => c.charCodeAt(0)), 8 + 2 + 12 + 4)

  const ascii = (t: string) => Array.from(t, (c) => c.charCodeAt(0))
  const cabeca = [0, 0, 0, 0x18, ...ascii('ftypcrx '), 0, 0, 0, 1, ...ascii('crx isom')]
  const caixa = [0, 0, 0, 0, ...ascii('CMT2')]
  return new Uint8Array([...cabeca, ...caixa, ...tiff])
}

test('reconhece o container do CR3', () => {
  assert.equal(ehCr3(cr3Sintetico('2026:10:15 10:00:03')), true)
  assert.equal(ehCr3(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), false)
})

test('le a hora da caixa CMT2, em little e big endian', () => {
  assert.equal(horaDoCr3(cr3Sintetico('2026:10:15 10:00:03')), '2026-10-15T10:00:03')
  assert.equal(horaDoCr3(cr3Sintetico('2021:05:12 12:16:33', false)), '2021-05-12T12:16:33')
})

test('sem CMT2 ou com texto estranho devolve nulo, sem quebrar', () => {
  assert.equal(horaDoCr3(new Uint8Array(100)), null)
  assert.equal(horaDoCr3(cr3Sintetico('nao e uma data!!!!')), null)
  assert.equal(horaDoCr3(cr3Sintetico('2026:10:15 10:00:03').subarray(0, 40)), null)
})

// Com arquivos reais, se estiverem a mao (variavel CR3_AMOSTRAS = pasta com .CR3):
// a hora tem de bater com a que a LibRaw le do mesmo arquivo.
const pasta = process.env.CR3_AMOSTRAS
test('arquivos CR3 reais', { skip: !pasta || !existsSync(pasta) }, async () => {
  const { readdirSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  for (const nome of readdirSync(pasta!).filter((n) => /\.cr3$/i.test(n))) {
    const bytes = new Uint8Array(readFileSync(resolve(pasta!, nome)).subarray(0, BYTES_PARA_CR3))
    assert.equal(ehCr3(bytes), true, nome)
    const hora = horaDoCr3(bytes)
    assert.match(hora ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, `${nome}: ${hora}`)
    console.log(`   ${nome}: ${hora}`)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  dimensoesOrientadas,
  matrizDaOrientacao,
  orientacaoDoFlipLibRaw,
  orientacaoValida,
  type Matriz,
  type Orientacao,
} from './orientacao.ts'

/** Aplica a matriz do canvas a um ponto: x' = a*x + c*y + e, y' = b*x + d*y + f. */
function aplicar([a, b, c, d, e, f]: Matriz, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f]
}

// Foto guardada com 6 de largura por 4 de altura. Para cada orientacao do EXIF:
// onde vai parar o canto superior esquerdo (0,0) e o inferior direito (6,4) do
// arquivo, num canvas ja das dimensoes orientadas. Os valores vem da definicao
// do EXIF (CIPA DC-008), nao da implementacao.
const W = 6
const H = 4
const ESPERADO: Record<Orientacao, { origem: [number, number]; oposto: [number, number] }> = {
  1: { origem: [0, 0], oposto: [6, 4] },
  2: { origem: [6, 0], oposto: [0, 4] }, // espelhada na horizontal
  3: { origem: [6, 4], oposto: [0, 0] }, // girada 180
  4: { origem: [0, 4], oposto: [6, 0] }, // espelhada na vertical
  5: { origem: [0, 0], oposto: [4, 6] }, // transposta
  6: { origem: [4, 0], oposto: [0, 6] }, // girada 90 horario (retrato comum)
  7: { origem: [4, 6], oposto: [0, 0] }, // transversa
  8: { origem: [0, 6], oposto: [4, 0] }, // girada 90 anti-horario (retrato comum)
}

for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as Orientacao[]) {
  test(`matriz da orientacao ${o} leva os cantos para o lugar certo`, () => {
    const m = matrizDaOrientacao(o, W, H)
    assert.deepEqual(aplicar(m, 0, 0), ESPERADO[o].origem)
    assert.deepEqual(aplicar(m, W, H), ESPERADO[o].oposto)
  })

  test(`a orientacao ${o} deixa todo o desenho dentro do canvas orientado`, () => {
    const { largura, altura } = dimensoesOrientadas(W, H, o)
    const m = matrizDaOrientacao(o, W, H)
    for (const [x, y] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ]) {
      const [px, py] = aplicar(m, x, y)
      assert.ok(px >= 0 && px <= largura, `x=${px} fora de 0..${largura}`)
      assert.ok(py >= 0 && py <= altura, `y=${py} fora de 0..${altura}`)
    }
  })
}

test('5 a 8 trocam largura por altura, 1 a 4 nao', () => {
  for (const o of [1, 2, 3, 4] as Orientacao[]) {
    assert.deepEqual(dimensoesOrientadas(6000, 4000, o), { largura: 6000, altura: 4000 })
  }
  for (const o of [5, 6, 7, 8] as Orientacao[]) {
    assert.deepEqual(dimensoesOrientadas(6000, 4000, o), { largura: 4000, altura: 6000 })
  }
})

test('valor fora de 1..8 vira 1 em vez de quebrar', () => {
  for (const ruim of [0, 9, -1, 2.5, '6', null, undefined, NaN]) {
    assert.equal(orientacaoValida(ruim), 1)
  }
  assert.equal(orientacaoValida(6), 6)
})

test('codigos de giro da LibRaw viram a escala do EXIF', () => {
  assert.equal(orientacaoDoFlipLibRaw(0), 1)
  assert.equal(orientacaoDoFlipLibRaw(3), 3)
  assert.equal(orientacaoDoFlipLibRaw(5), 8)
  assert.equal(orientacaoDoFlipLibRaw(6), 6)
  assert.equal(orientacaoDoFlipLibRaw(99), 1)
})

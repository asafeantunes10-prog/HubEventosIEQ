import { test } from 'node:test'
import assert from 'node:assert/strict'

import { juntarManifesto } from './manifesto.ts'

const evento = (slug: string, ids: string[]) => ({
  entradas: ids
    .flatMap((id) => [`"/fotos/${slug}/${id}-t.webp":"t${id}"`, `"/fotos/${slug}/${id}-g.webp":"g${id}"`])
    .join(','),
  hashes: ids.flatMap((id) => [`"t${id}"`, `"g${id}"`]).join(','),
  fotos: ids.length,
  arquivos: ids.length * 2,
})

test('o manifesto de varios eventos e um JSON valido', () => {
  const m = juntarManifesto([evento('a', ['1', '2']), evento('b', ['3'])])

  const objeto = JSON.parse(m.manifesto)
  assert.equal(Object.keys(objeto).length, 6)
  assert.equal(objeto['/fotos/a/1-t.webp'], 't1')
  assert.equal(objeto['/fotos/b/3-g.webp'], 'g3')

  assert.deepEqual(JSON.parse(m.hashes).hashes, ['t1', 'g1', 't2', 'g2', 't3', 'g3'])
  assert.equal(m.arquivos, 6)
})

test('sem nenhum evento, o manifesto e vazio mas continua sendo JSON', () => {
  const m = juntarManifesto([])
  assert.deepEqual(JSON.parse(m.manifesto), {})
  assert.deepEqual(JSON.parse(m.hashes), { hashes: [] })
  assert.equal(m.arquivos, 0)
})

test('evento sem texto (tudo nulo) nao deixa virgula sobrando', () => {
  const m = juntarManifesto([
    { entradas: null, hashes: null, fotos: 0, arquivos: 0 },
    evento('a', ['1']),
  ])
  assert.equal(Object.keys(JSON.parse(m.manifesto)).length, 2)
})

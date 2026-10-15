import { test } from 'node:test'
import assert from 'node:assert/strict'

import { classificar, extensaoDe } from './formatos.ts'

test('JPEG, PNG e WebP sao imagens, em qualquer caixa', () => {
  for (const nome of ['a.jpg', 'A.JPG', 'b.jpeg', 'c.png', 'd.WEBP']) {
    assert.equal(classificar(nome).tipo, 'imagem', nome)
  }
})

test('os RAW da Sony e da Canon sao reconhecidos', () => {
  for (const nome of ['DSC00001.ARW', 'IMG_0001.CR3', 'IMG_0002.cr2', 'x.dng', 'y.NEF', 'z.raf']) {
    assert.equal(classificar(nome).tipo, 'raw', nome)
  }
})

test('arquivo de apoio (.xmp, .thm) e rastro de macOS sao ignorados, sem erro', () => {
  for (const nome of ['DSC00001.xmp', 'IMG_0001.THM', '._IMG_0001.JPG', '.DS_Store', 'Thumbs.db']) {
    assert.equal(classificar(nome).tipo, 'ignorar', nome)
  }
})

test('o que nao e aceito volta com o motivo escrito', () => {
  for (const nome of ['iphone.heic', 'scan.tif', 'clipe.mov', 'coisa.xyz', 'semextensao']) {
    const c = classificar(nome)
    assert.equal(c.tipo, 'nao-suportado', nome)
    assert.ok(c.tipo === 'nao-suportado' && c.motivo.length > 10, `${nome} sem motivo`)
  }
})

test('o caminho com pasta nao atrapalha (webkitdirectory)', () => {
  assert.equal(classificar('DCIM/100CANON/IMG_0001.CR3').tipo, 'raw')
  assert.equal(classificar('DCIM\\100CANON\\._IMG_0001.CR3').tipo, 'ignorar')
})

test('extensaoDe', () => {
  assert.equal(extensaoDe('a.b.JPG'), 'jpg')
  assert.equal(extensaoDe('sem'), '')
})

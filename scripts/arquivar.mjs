/**
 * Arquiva um evento: apaga as versoes -g (2048px) das fotos dele e marca
 * `arquivado = 1` no banco. As versoes -t (400px) ficam — a grade continua de
 * pe e a foto ainda abre em tela cheia (so que na qualidade da miniatura); o
 * que deixa de existir e o download em alta e o ZIP (ver `Evento.tsx`,
 * `Visualizador.tsx`, `CartaoFoto.tsx` e `BaixarTudo.tsx`, que escondem esses
 * botoes quando `evento.arquivado` vem `true` da API).
 *
 * POR QUE ISTO EXISTE
 * O teto do plano gratuito e CONTAGEM DE ARQUIVOS: 20.000 por site. A -g de
 * uma foto e o arquivo mais pesado, mas conta como "1 arquivo" igual a -t no
 * teto — apagar so ela libera ~94% dos arquivos daquele evento sem tirar a
 * pagina do ar.
 *
 * DRY-RUN POR PADRAO. Apagar arquivo aqui e SEM VOLTA — nao ha backup
 * automatico de `fotos/` (ver o `.gitignore`). Sem `--confirmar`, o script so
 * mostra quantas fotos e quantos bytes seriam apagados; nada muda no disco nem
 * no banco.
 *
 * Uso:
 *   npm run arquivar culto-de-jovens-2026                    (so mostra o que faria)
 *   npm run arquivar culto-de-jovens-2026 -- --confirmar      (apaga de verdade e publica)
 *   npm run arquivar culto-de-jovens-2026 -- --confirmar --local   (banco de teste, sem deploy)
 */
import { existsSync, statSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { aspas, consultar, executar } from './d1.mjs'
import { PASTA_FOTOS, escreverEspelho, construirSite, projetoPagesExiste, publicarNoPages } from './implantar.mjs'

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function lerArgumentos() {
  const args = process.argv.slice(2)
  const local = args.includes('--local')
  const confirmar = args.includes('--confirmar')
  const slug = args.find((a) => !a.startsWith('--'))

  if (!slug) {
    console.error(
      '\n  Uso: npm run arquivar <slug-do-evento>\n\n' +
        '  Sem --confirmar, so mostra o que seria apagado — nada muda.\n\n' +
        '    --confirmar   apaga as versoes -g de verdade, atualiza o banco e publica\n' +
        '    --local       usa o banco de teste da maquina, nao publica\n'
    )
    process.exit(1)
  }

  return { slug, local, confirmar }
}

function principal() {
  const { slug, local, confirmar } = lerArgumentos()
  const opcoes = { local }

  const eventos = consultar(
    `select id, titulo, arquivado from eventos where slug = ${aspas(slug)};`,
    opcoes
  )
  if (eventos.length === 0) {
    console.error(`\n  Nao achei o evento "${slug}"${local ? ' no banco local' : ''}.\n`)
    process.exit(1)
  }

  const evento = eventos[0]
  if (evento.arquivado) {
    console.log(`\n  "${slug}" ja esta arquivado. Nada para fazer.\n`)
    return
  }

  const destino = resolve(PASTA_FOTOS, slug)
  if (!existsSync(destino)) {
    console.error(`\n  A pasta "${destino}" nao existe nesta maquina.\n`)
    process.exit(1)
  }

  const fotos = consultar(`select id, caminho from fotos where evento_id = ${aspas(evento.id)};`, opcoes)
  if (fotos.length === 0) {
    console.log(`\n  "${slug}" nao tem foto nenhuma no banco. Nada para arquivar.\n`)
    return
  }

  let bytes = 0
  const arquivosG = []
  for (const foto of fotos) {
    // 'culto-jovens-2026/a1b2' -> 'a1b2-g.webp'
    const nomeBase = foto.caminho.slice(slug.length + 1)
    const caminhoG = resolve(destino, `${nomeBase}-g.webp`)
    if (existsSync(caminhoG)) {
      bytes += statSync(caminhoG).size
      arquivosG.push(caminhoG)
    }
  }

  console.log(`\n== ${evento.titulo} (/e/${slug}) ==`)
  console.log(`   ${fotos.length} fotos no banco, ${arquivosG.length} versoes -g no disco, ${mb(bytes)}\n`)

  if (!confirmar) {
    console.log(
      '  Isto foi so uma simulacao — nada foi apagado.\n' +
        '  Para apagar de verdade e marcar o evento como arquivado:\n\n' +
        `    npm run arquivar ${slug} -- --confirmar\n`
    )
    return
  }

  for (const caminho of arquivosG) rmSync(caminho, { force: true })
  executar(`update eventos set arquivado = 1 where id = ${aspas(evento.id)};`, opcoes)
  escreverEspelho(evento.id, destino, opcoes)

  console.log(`  ${arquivosG.length} versoes -g apagadas. "${slug}" marcado como arquivado.`)

  if (local) {
    console.log('\n  Banco local: o site nao foi construido nem publicado.\n')
    return
  }

  console.log('\n  Construindo o site e publicando...\n')
  construirSite()

  if (!projetoPagesExiste()) {
    console.log('\n  O projeto Pages ainda nao existe — nada para publicar.\n')
    return
  }

  publicarNoPages()
  console.log(
    `\n  Publicado. As fotos grandes de "${slug}" pararam de ser servidas; as\n` +
      '  miniaturas continuam, entao a pagina do evento continua de pe.\n'
  )
}

try {
  principal()
} catch (e) {
  console.error(`\n  Falhou: ${e.message}\n`)
  process.exit(1)
}

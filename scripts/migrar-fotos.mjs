/**
 * Passo UNICO: leva as fotos que ja existem em `fotos/` para o projeto de fotos
 * (`eventos-ieq-fotos`) e grava no banco o hash de cada arquivo.
 *
 * POR QUE ISTO EXISTE
 * Antes, as fotos eram arquivos de `fotos/`, publicados junto com o site. Agora
 * moram num segundo projeto Pages, que o painel atualiza pela API do Cloudflare
 * (ver `functions/lib/paginasApi.ts`). Para o painel conseguir montar o deploy
 * desse projeto ele precisa do hash de cada foto — e as que ja existiam nao
 * tem. Este script:
 *
 *   1. calcula o hash de cada WebP de `fotos/` (o mesmo `hashPages` que o
 *      navegador usa) e grava em `fotos.hash_t` / `fotos.hash_g`;
 *   2. faz o PRIMEIRO deploy do projeto de fotos, com todos os arquivos;
 *   3. confere que uma foto responde la, com CORS.
 *
 * A ORDEM IMPORTA, e e de proposito a que nao derruba o site no ar: as fotos
 * passam a existir no projeto novo ANTES de o site passar a apontar para la. So
 * depois de este script terminar bem voce publica o site (`npm run implantar`),
 * que e quando o endereco das fotos muda para os visitantes.
 *
 * Pode rodar de novo sem problema: recalcula os hashes e refaz o deploy.
 *
 * E SE `fotos/` NAO TEM AS FOTOS DESTE COMPUTADOR?
 * Aconteceu: o primeiro evento real foi publicado de outra maquina, e `fotos/`
 * daqui so tinha o evento de teste. Os arquivos continuam sendo servidos pelo
 * site no ar (que so deixa de te-los quando `npm run implantar` o substitui),
 * entao `--baixar-do-site` os traz de la para `fotos/` — os mesmos bytes que os
 * visitantes recebem hoje — e o resto da migracao segue normalmente. Isso so
 * funciona ANTES do `implantar`; depois dele o site antigo deixa de existir.
 *
 * Uso:
 *   npm run migrar-fotos
 *   npm run migrar-fotos -- --baixar-do-site     (traz de eventos-ieq.pages.dev o que faltar em fotos/)
 *   npm run migrar-fotos -- --local              (banco de teste; nao faz o deploy)
 *   npm run migrar-fotos -- --apagar-sem-arquivo (DESTRUTIVO: apaga do banco as fotos sem arquivo)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { aspas, consultar, executar, executarEmLotes } from './d1.mjs'
import { bytesParaBase64, hashPages } from '../src/lib/envio/hashPages.ts'
import { CABECALHOS_FOTOS } from '../functions/lib/cabecalhosFotos.ts'

const RAIZ = resolve(import.meta.dirname, '..')
const PASTA_FOTOS = resolve(RAIZ, 'fotos')
const PROJETO_FOTOS = 'eventos-ieq-fotos'
const URL_FOTOS = `https://${PROJETO_FOTOS}.pages.dev`
/** O site no ar, que ainda serve as fotos antigas em `/fotos/...`. */
const URL_SITE = 'https://eventos-ieq.pages.dev'
const WRANGLER = resolve(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

const args = process.argv.slice(2)
const local = args.includes('--local')
const apagarSemArquivo = args.includes('--apagar-sem-arquivo')
const baixarDoSite = args.includes('--baixar-do-site')
const opcoes = { local }

function hashDoArquivo(caminho) {
  return hashPages(bytesParaBase64(new Uint8Array(readFileSync(caminho))), 'webp')
}

/** Os arquivos que uma foto precisa ter: evento arquivado so tem a miniatura. */
function arquivosDaFoto(foto) {
  const sufixos = Number(foto.arquivado) === 1 ? ['t'] : ['t', 'g']
  return sufixos.map((s) => ({
    sufixo: s,
    disco: resolve(PASTA_FOTOS, `${foto.caminho}-${s}.webp`),
    url: `${URL_SITE}/fotos/${foto.caminho}-${s}.webp`,
  }))
}

/**
 * Baixa um arquivo do site no ar. So aceita o que realmente parece um WebP:
 * uma pagina de erro salva como `.webp` entraria no deploy e viraria "foto
 * quebrada" para todo mundo, sem ninguem notar.
 */
async function baixarDoSiteNoAr(arquivo) {
  const resposta = await fetch(arquivo.url).catch(() => null)
  if (!resposta || resposta.status !== 200) return false

  const bytes = new Uint8Array(await resposta.arrayBuffer())
  const riff = String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
  const webp = String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  if (!riff || !webp) return false

  mkdirSync(dirname(arquivo.disco), { recursive: true })
  writeFileSync(arquivo.disco, bytes)
  return true
}

/** Baixa o que falta, com poucas conexoes de cada vez, e conta o que nao veio. */
async function trazerFaltantes(fotos) {
  const faltando = fotos.flatMap((f) => arquivosDaFoto(f).filter((a) => !existsSync(a.disco)))
  if (faltando.length === 0) return

  console.log(`\n  Baixando ${faltando.length} arquivo(s) de ${URL_SITE} para fotos/ ...`)

  let proximo = 0
  let baixados = 0
  const falhas = []

  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (proximo < faltando.length) {
        const arquivo = faltando[proximo++]
        if (await baixarDoSiteNoAr(arquivo)) baixados++
        else falhas.push(arquivo.url)
        process.stdout.write(`\r  baixados: ${baixados}/${faltando.length}`)
      }
    })
  )
  process.stdout.write('\n')

  if (falhas.length > 0) {
    console.log(`  ${falhas.length} arquivo(s) nao vieram do site (nao existem la, ou deram erro).`)
  }
}

async function principal() {
  console.log(`\n== Migrar fotos para o projeto "${PROJETO_FOTOS}"${local ? '  [banco local]' : ''} ==\n`)

  if (!existsSync(PASTA_FOTOS)) {
    if (!baixarDoSite) {
      console.error(
        '  Nao achei a pasta fotos/ nesta maquina. Rode isto no computador onde ela mora, ou\n' +
          '  use --baixar-do-site para trazer as fotos do site no ar.\n'
      )
      process.exit(1)
    }
    mkdirSync(PASTA_FOTOS, { recursive: true })
  }

  /*
    TRAVA CONTRA REPETIR DEPOIS QUE O PAINEL JA RECEBEU FOTOS.
    Fotos enviadas pelo painel moram so no projeto de fotos (nao ha copia em
    fotos/), e todo deploy do Pages SUBSTITUI o anterior. Rodar isto de novo com
    elas no banco faria um deploy so com o que esta em fotos/ e as apagaria do ar.
    `chave_origem` so existe em foto registrada pelo painel.
  */
  const doPainel = consultar(
    'select count(*) as n from fotos where chave_origem is not null;',
    opcoes
  )[0]?.n
  if (Number(doPainel) > 0) {
    console.error(
      `  Este banco ja tem ${doPainel} foto(s) enviadas pelo painel. A migracao e so para a\n` +
        '  primeira vez: rodar de novo apagaria essas fotos do projeto de fotos.\n' +
        '  Se precisa mesmo, restaure-as pelo painel depois, ou fale com quem mantem o projeto.\n'
    )
    process.exit(1)
  }

  const fotos = consultar(
    'select f.id, f.caminho, e.arquivado from fotos f join eventos e on e.id = f.evento_id;',
    opcoes
  )
  console.log(`  ${fotos.length} fotos no banco.`)

  if (baixarDoSite) await trazerFaltantes(fotos)

  // ---- 1. hashes
  const comHash = []
  const semArquivo = []
  let contados = 0

  for (const foto of fotos) {
    const t = resolve(PASTA_FOTOS, `${foto.caminho}-t.webp`)
    const g = resolve(PASTA_FOTOS, `${foto.caminho}-g.webp`)
    const arquivado = Number(foto.arquivado) === 1

    // Evento arquivado so tem a miniatura; as outras precisam das duas.
    if (!existsSync(t) || (!arquivado && !existsSync(g))) {
      semArquivo.push(foto.caminho)
      continue
    }

    comHash.push({
      id: foto.id,
      hashT: await hashDoArquivo(t),
      hashG: arquivado ? null : await hashDoArquivo(g),
    })

    if (++contados % 100 === 0) process.stdout.write(`\r  calculando hashes: ${contados}`)
  }
  if (contados >= 100) process.stdout.write('\n')

  if (semArquivo.length > 0) {
    console.log(`\n  ATENCAO: ${semArquivo.length} foto(s) estao no banco mas NAO tem arquivo em fotos/:`)
    for (const c of semArquivo.slice(0, 15)) console.log(`    - ${c}`)
    if (semArquivo.length > 15) console.log(`    ... e mais ${semArquivo.length - 15}`)

    if (!apagarSemArquivo) {
      console.log(
        '\n  NADA FOI APAGADO nem publicado. Sem o arquivo nao ha hash, e sem hash o painel recusa\n' +
          '  publicar (o deploy apagaria essas fotos do ar). Saidas, da mais segura para a menos:\n' +
          '    - se o site no ar AINDA mostra essas fotos: rode de novo com --baixar-do-site\n' +
          '      (precisa ser antes do `npm run implantar`);\n' +
          '    - restaure a pasta fotos/ de um backup e rode de novo;\n' +
          '    - so se as fotos realmente nao existem mais: --apagar-sem-arquivo. ISSO APAGA AS\n' +
          '      LINHAS DO BANCO e nao tem volta; nunca use com um evento real na lista acima.\n'
      )
      process.exit(1)
    }

    const ids = fotos.filter((f) => semArquivo.includes(f.caminho)).map((f) => aspas(f.id))
    executar(`delete from fotos where id in (${ids.join(', ')});`, opcoes)
    console.log(`  ${ids.length} linha(s) sem arquivo removidas do banco.`)
  }

  executarEmLotes(
    comHash.map(
      (f) =>
        `update fotos set hash_t = ${aspas(f.hashT)}, hash_g = ${aspas(f.hashG)} where id = ${aspas(f.id)};`
    ),
    {
      ...opcoes,
      aoProgredir: (feitas, total) => process.stdout.write(`\r  gravando hashes no banco: ${feitas}/${total}`),
    }
  )
  process.stdout.write('\n')

  if (local) {
    console.log('\n  Banco local: os hashes foram gravados, mas nao ha deploy.\n')
    return
  }

  // ---- 2. deploy do projeto de fotos
  const temporaria = resolve(RAIZ, '.migracao-fotos')
  rmSync(temporaria, { recursive: true, force: true })
  mkdirSync(resolve(temporaria, 'fotos'), { recursive: true })
  writeFileSync(resolve(temporaria, '_headers'), CABECALHOS_FOTOS, 'utf8')

  const arquivados = new Set(fotos.filter((f) => Number(f.arquivado) === 1).map((f) => f.caminho))
  let arquivosNoDeploy = 0
  for (const foto of fotos.filter((f) => !semArquivo.includes(f.caminho))) {
    for (const sufixo of arquivados.has(foto.caminho) ? ['t'] : ['t', 'g']) {
      const origem = resolve(PASTA_FOTOS, `${foto.caminho}-${sufixo}.webp`)
      const destino = resolve(temporaria, 'fotos', `${foto.caminho}-${sufixo}.webp`)
      mkdirSync(resolve(destino, '..'), { recursive: true })
      try {
        linkSync(origem, destino)
      } catch {
        copyFileSync(origem, destino)
      }
      arquivosNoDeploy++
    }
  }

  console.log(`\n  Enviando ${arquivosNoDeploy} arquivos para ${PROJETO_FOTOS}...\n`)
  const r = spawnSync(
    process.execPath,
    [WRANGLER, 'pages', 'deploy', temporaria, `--project-name=${PROJETO_FOTOS}`, '--branch=main'],
    { stdio: 'inherit', cwd: RAIZ }
  )
  rmSync(temporaria, { recursive: true, force: true })

  if (r.status !== 0) {
    console.error(
      `\n  O deploy falhou. O projeto "${PROJETO_FOTOS}" existe? Crie com:\n` +
        `    npx wrangler pages project create ${PROJETO_FOTOS} --production-branch=main\n`
    )
    process.exit(1)
  }

  // ---- 3. conferir
  const amostra = fotos.find((f) => !semArquivo.includes(f.caminho))
  if (amostra) {
    const url = `${URL_FOTOS}/fotos/${amostra.caminho}-t.webp`
    // Logo apos o deploy a borda ainda pode estar propagando; algumas tentativas.
    let ok = false
    for (let i = 0; i < 6 && !ok; i++) {
      const resposta = await fetch(url, { headers: { origin: 'https://eventos-ieq.pages.dev' } }).catch(() => null)
      ok =
        resposta?.status === 200 && resposta.headers.get('access-control-allow-origin') === '*'
      if (!ok) await new Promise((res) => setTimeout(res, 3000))
    }
    console.log(
      ok
        ? `\n  Conferido: ${url} responde 200 com CORS.\n`
        : `\n  ATENCAO: nao consegui confirmar ${url} (200 + CORS). Espere um minuto e abra no navegador.\n`
    )
  }

  console.log(
    '  Pronto. As fotos ja estao no projeto novo. Agora publique o site para ele passar a\n' +
      '  apontar para la:\n\n    npm run implantar\n'
  )
}

principal().catch((e) => {
  console.error(`\n  Falhou: ${e.message}\n`)
  process.exit(1)
})

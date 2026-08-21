/**
 * O que `publicar.mjs` e `arquivar.mjs` tem em comum: construir o site, levar
 * `fotos/` para dentro de `dist/` e mandar para o Cloudflare Pages.
 *
 * Foi separado de `publicar.mjs` quando `arquivar.mjs` nasceu — os dois
 * terminam do mesmo jeito (mexer no que esta em `fotos/`, depois publicar de
 * novo), e duplicar essa cauda seria o tipo de coisa que uma hora se corrige
 * num arquivo e esquece no outro.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, mkdirSync, existsSync, linkSync, copyFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { aspas, consultar } from './d1.mjs'

export const RAIZ = resolve(import.meta.dirname, '..')

/** Onde as fotos processadas moram. Fora do git — ver o aviso no `.gitignore`. */
export const PASTA_FOTOS = resolve(RAIZ, 'fotos')

/** O que o `vite build` produz e o que o `pages deploy` envia. */
export const PASTA_DIST = resolve(RAIZ, 'dist')

/**
 * O projeto Pages, e o endereco publico: eventos-ieq.pages.dev.
 *
 * Nao e o mesmo nome do banco D1 (`hub-eventos-ieq`) de proposito: o projeto
 * foi criado com o nome curto, que e o que vai ser divulgado, e renomear um
 * projeto Pages significa perder o endereco. O banco fica como esta.
 */
export const PROJETO_PAGES = 'eventos-ieq'

/** Teto do plano gratuito, e o numero que decide quando arquivar. */
export const LIMITE_ARQUIVOS = 20_000
export const ALERTA_ARQUIVOS = 18_000

/**
 * Quantos arquivos o site tem, somando todos os eventos.
 *
 * So conta `.webp`: e o que vai para o deploy e o que pesa contra o teto de
 * 20.000. O `fotos.json` de cada evento fica de fora — ele nunca e publicado.
 */
export function contarArquivosDoSite() {
  if (!existsSync(PASTA_FOTOS)) return 0

  return readdirSync(PASTA_FOTOS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .reduce(
      (total, e) =>
        total + readdirSync(resolve(PASTA_FOTOS, e.name)).filter((n) => n.endsWith('.webp')).length,
      0
    )
}

/**
 * Roda uma ferramenta do projeto com o proprio Node.
 *
 * Chamar `npm` ou `npx` exigiria `shell: true` no Windows (os dois sao `.cmd`),
 * e ai os argumentos passam a ser concatenados em vez de escapados. Apontar
 * direto para o `.js` de cada ferramenta evita o shell inteiro.
 */
export function rodarFerramenta(caminhoRelativo, args, rotulo) {
  const r = spawnSync(process.execPath, [resolve(RAIZ, caminhoRelativo), ...args], {
    stdio: 'inherit',
    cwd: RAIZ,
  })

  if (r.status !== 0) throw new Error(`${rotulo} falhou (codigo ${r.status}).`)
}

/**
 * Grava um `fotos.json` na pasta do evento, espelhando o que esta no banco.
 *
 * POR QUE UM ESPELHO, SE O D1 E A VERDADE
 * Nem `fotos/` nem o D1 tem backup automatico — a pasta esta fora do git e o
 * banco vive so na Cloudflare. Perder o banco deixaria os WebP no disco sem
 * nenhuma forma de reconstruir a galeria: o nome do arquivo e um identificador
 * sorteado, entao o que liga `8feb55da529f` a `IMG_0001.jpg`, a ordem, as
 * dimensoes e o LQIP existe unicamente no D1.
 *
 * Com o espelho, a pasta do evento passa a ser autossuficiente: quem tiver a
 * copia do HD externo consegue repovoar o banco inteiro. Custa alguns KB por
 * evento e nunca e publicado (o deploy so leva `.webp`).
 */
export function escreverEspelho(eventoId, destino, opcoes) {
  const fotos = consultar(
    'select id, caminho, nome_original, largura, altura, lqip, ordem ' +
      `from fotos where evento_id = ${aspas(eventoId)} order by ordem;`,
    opcoes
  )

  const evento = consultar(`select * from eventos where id = ${aspas(eventoId)};`, opcoes)[0]

  writeFileSync(resolve(destino, 'fotos.json'), JSON.stringify({ evento, fotos }, null, 2), 'utf8')
}

/**
 * Copia `fotos/` para dentro de `dist/` por hardlink.
 *
 * POR QUE AS FOTOS NAO MORAM EM `public/`
 * O Vite copia `public/` inteiro a cada build. Com alguns GB de imagem la, todo
 * `npm run dev` e todo build passariam minutos movendo bytes que nao mudaram.
 *
 * POR QUE HARDLINK, E NAO COPIA
 * Um hardlink e um segundo nome para os MESMOS bytes no disco: e instantaneo e
 * nao ocupa espaco nenhum. Copiar 20 eventos a cada publicacao seria mover
 * ~6 GB para produzir uma segunda copia identica que sera apagada no proximo
 * build. Quando o link nao e possivel — `dist/` noutra particao, ou um sistema
 * de arquivos que nao suporta — cai para copia, que funciona igual, so mais
 * devagar.
 *
 * TODOS OS EVENTOS, NAO SO O ATUAL. O `vite build` limpa o `dist/` e o
 * `pages deploy` publica o que estiver la: mandar so o evento novo APAGARIA
 * todas as fotos dos eventos anteriores do site.
 */
export function popularDistComFotos() {
  if (!existsSync(PASTA_FOTOS)) return { arquivos: 0, copiados: 0 }

  const destinoRaiz = resolve(PASTA_DIST, 'fotos')
  rmSync(destinoRaiz, { recursive: true, force: true })

  let arquivos = 0
  let copiados = 0

  for (const entrada of readdirSync(PASTA_FOTOS, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue

    const origemPasta = resolve(PASTA_FOTOS, entrada.name)
    const destinoPasta = resolve(destinoRaiz, entrada.name)
    mkdirSync(destinoPasta, { recursive: true })

    // So `.webp` atravessa: o `fotos.json` e metadado local, nunca um asset.
    for (const nome of readdirSync(origemPasta).filter((n) => n.endsWith('.webp'))) {
      const origem = resolve(origemPasta, nome)
      const destino = resolve(destinoPasta, nome)

      try {
        linkSync(origem, destino)
      } catch {
        copyFileSync(origem, destino)
        copiados++
      }
      arquivos++
    }
  }

  return { arquivos, copiados }
}

/**
 * O projeto Pages precisa existir antes do primeiro deploy.
 *
 * Perguntar antes e melhor que deixar o `pages deploy` criar sozinho: ele cria
 * com o nome que estiver a mao e sem aviso, e desfazer isso depois significa
 * apagar o projeto e perder o endereco `.pages.dev` que ja foi divulgado.
 */
export function projetoPagesExiste() {
  const r = spawnSync(
    process.execPath,
    [resolve(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'project', 'list'],
    { encoding: 'utf8' }
  )

  if (r.status !== 0) return false
  return (r.stdout ?? '').includes(PROJETO_PAGES)
}

export function publicarNoPages() {
  rodarFerramenta(
    'node_modules/wrangler/bin/wrangler.js',
    ['pages', 'deploy', 'dist', `--project-name=${PROJETO_PAGES}`],
    'O deploy'
  )
}

/** Constroi o site (checagem de tipos + vite build) e popula `dist/fotos/`. */
export function construirSite() {
  rodarFerramenta('node_modules/typescript/bin/tsc', ['-b'], 'A checagem de tipos')
  rodarFerramenta('node_modules/vite/bin/vite.js', ['build'], 'O build')
  return popularDistComFotos()
}

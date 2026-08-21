/**
 * Publica um evento: le uma pasta de originais da camera, gera as duas versoes
 * WebP, grava os metadados no D1 e manda o site para o ar.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Foto de camera vem grande e em JPEG. Servir o arquivo cru significa mandar
 * para o celular de alguem em 4G varias vezes mais bytes do que a tela dele
 * consegue mostrar. Este script resolve isso:
 *
 *   1. Converte para WebP (mesma qualidade visual, ~30% do peso do JPEG).
 *   2. Gera duas larguras, cada uma com um proposito:
 *        t   400px  ~30 KB   a grade em mosaico
 *        g  2048px ~450 KB   o visualizador, o download e o ZIP
 *   3. Nunca aumenta a imagem: se o original tem 1600px, nao se inventa um
 *      2048px borrado so para preencher a tabela.
 *   4. Extrai um LQIP — uma miniatura de 20px, borrada, em base64. Ela vai
 *      embutida no JSON da galeria (nao custa requisicao nenhuma) e aparece
 *      instantaneamente enquanto a foto real carrega, no lugar do retangulo
 *      cinza. E o truque que faz o site "parecer" rapido em conexao ruim.
 *
 * DUAS VERSOES, NAO TRES. O limite do plano gratuito e CONTAGEM DE ARQUIVOS —
 * 20.000 por site — e nao espaco nem banda. Cada tamanho a mais custa 500
 * arquivos por evento: um intermediario de 1080px cortaria a vida util do site
 * de ~20 eventos para ~13. A troca foi consciente.
 *
 * RETOMAVEL. Se cair na foto 300 de 500 — queda de luz, rede, um Ctrl+C —
 * rodar de novo continua de onde parou. O que ja esta no D1 e pulado pelo
 * `nome_original`, entao nada e reprocessado nem duplicado.
 *
 * Uso:
 *   npm run publicar "C:\\Fotos\\Culto de Jovens 2026"
 *   npm run publicar "C:\\Fotos\\..." -- --local        (banco de teste, sem deploy)
 *   npm run publicar "C:\\Fotos\\..." -- --sem-deploy   (processa e grava, nao publica)
 */
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import {
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  linkSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

import { aspas, consultar, executar, executarEmLotes } from './d1.mjs'

const RAIZ = resolve(import.meta.dirname, '..')

/** Onde as fotos processadas moram. Fora do git — ver o aviso no `.gitignore`. */
const PASTA_FOTOS = resolve(RAIZ, 'fotos')

/** O que o `vite build` produz e o que o `pages deploy` envia. */
const PASTA_DIST = resolve(RAIZ, 'dist')

/**
 * O projeto Pages, e o endereco publico: eventos-ieq.pages.dev.
 *
 * Nao e o mesmo nome do banco D1 (`hub-eventos-ieq`) de proposito: o projeto
 * foi criado com o nome curto, que e o que vai ser divulgado, e renomear um
 * projeto Pages significa perder o endereco. O banco fica como esta.
 */
const PROJETO_PAGES = 'eventos-ieq'

/** As duas versoes. Os mesmos sufixos que `urlFoto()` monta em `src/lib/fotos.ts`. */
const VERSOES = [
  { sufixo: 't', largura: 400 },
  { sufixo: 'g', largura: 2048 },
]

/**
 * 80 e o joelho da curva do WebP: abaixo disso o ceu e a pele comecam a mostrar
 * banding, acima o arquivo cresce sem diferenca visivel na tela.
 */
const QUALIDADE = 80

/**
 * `effort: 6` gasta mais CPU aqui para o arquivo sair menor. Vale a troca: o
 * processamento acontece uma vez, o download acontece milhares de vezes.
 */
const ESFORCO = 6

/**
 * Tamanho do identificador de cada foto, em digitos hexadecimais.
 *
 * 12 e nao 8. Com 8 digitos sao 4,3 bilhoes de combinacoes, o que parece muito
 * — mas o paradoxo do aniversario diz outra coisa: em 10.000 fotos (20 eventos
 * cheios) a chance de duas baterem passa de 1%. Como `id` e chave primaria, uma
 * colisao nao daria erro visivel: o INSERT do lote falharia e uma foto sumiria
 * da galeria sem explicacao. Com 12 digitos a chance cai para 1 em 5 milhoes.
 */
const DIGITOS_ID = 12

/** Teto do plano gratuito, e o numero que decide quando arquivar. */
const LIMITE_ARQUIVOS = 20_000
const ALERTA_ARQUIVOS = 18_000

const EXTENSOES = /\.(jpe?g|png|webp|tiff?|avif)$/i

// ---------------------------------------------------------------- utilitarios

function kb(bytes) {
  return (bytes / 1024).toFixed(0).padStart(5) + ' KB'
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/**
 * Transforma "Culto de Jovens 2026" em "culto-de-jovens-2026".
 *
 * O slug e o endereco publico (`/e/culto-de-jovens-2026`), o nome da pasta em
 * `fotos/` e a chave no banco — os tres derivam daqui, entao ele precisa ser
 * estavel e sem surpresa. `normalize('NFD')` separa a letra do acento para o
 * `replace` seguinte remover so o acento, preservando a letra.
 */
function paraSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Miniatura minuscula e borrada, embutida como data URI. 20px de largura da
 * ~400 bytes — cabe no JSON sem doer e mata o "flash de retangulo cinza".
 */
async function gerarLqip(entrada) {
  const buffer = await sharp(entrada)
    .resize(20, null, { fit: 'inside' })
    .blur(1.2)
    .webp({ quality: 32, alphaQuality: 40 })
    .toBuffer()
  return `data:image/webp;base64,${buffer.toString('base64')}`
}

/**
 * Quantos arquivos o site tem, somando todos os eventos.
 *
 * So conta `.webp`: e o que vai para o deploy e o que pesa contra o teto de
 * 20.000. O `fotos.json` de cada evento fica de fora — ele nunca e publicado.
 */
function contarArquivosDoSite() {
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
function rodarFerramenta(caminhoRelativo, args, rotulo) {
  const r = spawnSync(process.execPath, [resolve(RAIZ, caminhoRelativo), ...args], {
    stdio: 'inherit',
    cwd: RAIZ,
  })

  if (r.status !== 0) throw new Error(`${rotulo} falhou (codigo ${r.status}).`)
}

// ---------------------------------------------------------------- argumentos

function lerArgumentos() {
  const args = process.argv.slice(2)
  const local = args.includes('--local')
  // `--local` grava no banco de teste da maquina, entao publicar nao faria
  // sentido: o site no ar leria o banco de producao e nao acharia nada.
  const semDeploy = args.includes('--sem-deploy') || local
  const pastaBruta = args.find((a) => !a.startsWith('--'))

  if (!pastaBruta) {
    console.error(
      '\n  Uso: npm run publicar "C:\\Fotos\\Culto de Jovens 2026"\n\n' +
        '  O nome da pasta vira o titulo do evento e o endereco no site.\n\n' +
        '    --local        usa o banco de teste da maquina e nao publica\n' +
        '    --sem-deploy   processa e grava no banco, mas nao publica\n'
    )
    process.exit(1)
  }

  const pasta = resolve(pastaBruta)
  if (!existsSync(pasta)) {
    console.error(`\n  Nao achei a pasta "${pasta}".\n`)
    process.exit(1)
  }

  const titulo = basename(pasta)
  const slug = paraSlug(titulo)

  if (!slug) {
    console.error(`\n  Nao consegui tirar um endereco de "${titulo}".\n`)
    process.exit(1)
  }

  return { pasta, titulo, slug, local, semDeploy }
}

// ---------------------------------------------------------------- o banco

/**
 * Acha o evento pelo slug, ou cria um novo.
 *
 * Nasce como RASCUNHO de proposito. Publicar e uma decisao humana, tomada
 * depois de olhar a galeria pronta — nao um efeito colateral de processar
 * fotos. Enquanto o painel nao existe, o comando para publicar sai no relatorio
 * final.
 */
function garantirEvento(slug, titulo, opcoes) {
  const achados = consultar(
    `select id, titulo, status from eventos where slug = ${aspas(slug)};`,
    opcoes
  )

  if (achados.length > 0) {
    /*
      Um evento sem `id` nao existe. Sem esta checagem o valor vazio seguiria
      adiante e so apareceria como "NOT NULL constraint failed: fotos.evento_id"
      no meio da gravacao — depois de todas as fotos ja terem sido processadas,
      e com uma mensagem que nao aponta para a causa.
    */
    if (!achados[0].id) {
      throw new Error(`O banco devolveu um evento sem id para o slug "${slug}".`)
    }
    return { ...achados[0], novo: false }
  }

  const id = randomUUID()
  executar(
    `insert into eventos (id, slug, titulo, status) values ` +
      `(${aspas(id)}, ${aspas(slug)}, ${aspas(titulo)}, 'rascunho');`,
    opcoes
  )

  return { id, titulo, status: 'rascunho', novo: true }
}

/**
 * O que ja esta no banco para este evento.
 *
 * E daqui que sai a retomada: os nomes originais viram um conjunto, e o laco
 * principal pula tudo que ja passou. A maior `ordem` continua a numeracao, para
 * as fotos novas entrarem no fim da galeria em vez de embaralhar a existente.
 */
function fotosJaNoBanco(eventoId, opcoes) {
  const linhas = consultar(
    `select nome_original, ordem from fotos where evento_id = ${aspas(eventoId)};`,
    opcoes
  )

  return {
    nomes: new Set(linhas.map((l) => l.nome_original)),
    proximaOrdem: linhas.reduce((maior, l) => Math.max(maior, (l.ordem ?? 0) + 1), 0),
  }
}

function inserirFotos(eventoId, registros, opcoes) {
  const comandos = registros.map(
    (f) =>
      `insert into fotos (id, evento_id, caminho, nome_original, largura, altura, lqip, ordem) values (` +
      [
        aspas(f.id),
        aspas(eventoId),
        aspas(f.caminho),
        aspas(f.nome_original),
        aspas(f.largura),
        aspas(f.altura),
        aspas(f.lqip),
        aspas(f.ordem),
      ].join(', ') +
      ');'
  )

  executarEmLotes(comandos, {
    ...opcoes,
    aoProgredir: (feitas, total) => {
      process.stdout.write(`\r  gravando no banco: ${feitas}/${total}`)
      if (feitas === total) process.stdout.write('\n')
    },
  })
}

/**
 * Apaga os WebP da pasta do evento que nao tem linha correspondente no banco.
 *
 * POR QUE ISTO PRECISA EXISTIR
 * Uma retomada pode deixar lixo. Se o script cai DEPOIS de gravar os arquivos e
 * ANTES de gravar no banco, a execucao seguinte nao reconhece aquelas fotos
 * (a retomada compara pelo `nome_original`, que so existe no banco), reprocessa
 * os mesmos originais e gera arquivos novos com identificadores novos. Os
 * antigos ficam para tras: invisiveis no site, mas ocupando lugar no teto de
 * 20.000 arquivos e subindo no deploy.
 *
 * Roda depois dos INSERTs, e so olha a pasta deste evento. O banco e a verdade:
 * arquivo sem linha nao existe para o site.
 */
function limparOrfaos(slug, eventoId, destino, opcoes) {
  const vivos = new Set(
    consultar(`select caminho from fotos where evento_id = ${aspas(eventoId)};`, opcoes).map((l) =>
      // 'culto-jovens-2026/a1b2' -> 'a1b2'
      String(l.caminho).slice(slug.length + 1)
    )
  )

  let apagados = 0
  for (const nome of readdirSync(destino).filter((n) => n.endsWith('.webp'))) {
    // '<id>-t.webp' -> '<id>'
    const id = nome.replace(/-[tg]\.webp$/, '')
    if (!vivos.has(id)) {
      rmSync(resolve(destino, nome), { force: true })
      apagados++
    }
  }

  return apagados
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
function escreverEspelho(eventoId, destino, opcoes) {
  const fotos = consultar(
    'select id, caminho, nome_original, largura, altura, lqip, ordem ' +
      `from fotos where evento_id = ${aspas(eventoId)} order by ordem;`,
    opcoes
  )

  const evento = consultar(`select * from eventos where id = ${aspas(eventoId)};`, opcoes)[0]

  writeFileSync(
    resolve(destino, 'fotos.json'),
    JSON.stringify({ evento, fotos }, null, 2),
    'utf8'
  )
}

/** `total_fotos` sai de uma contagem real, nunca de um acumulador. */
function atualizarTotal(eventoId, opcoes) {
  executar(
    `update eventos set total_fotos = ` +
      `(select count(*) from fotos where evento_id = ${aspas(eventoId)}) ` +
      `where id = ${aspas(eventoId)};`,
    opcoes
  )
}

// ---------------------------------------------------------------- processamento

async function processarFoto(caminho, slug, ordem, destino) {
  const { width } = await sharp(caminho).metadata()

  /*
    Identificador sorteado, e nao o nome do arquivo. Duas razoes: nomes de
    camera se repetem entre cartoes (`IMG_0001` sai de todo cartao zerado), e
    uma chave que nunca muda deixa o navegador cachear a foto para sempre sem
    risco de mostrar uma imagem velha no lugar de outra.
  */
  const id = randomUUID().replace(/-/g, '').slice(0, DIGITOS_ID)

  const gerados = []
  for (const versao of VERSOES) {
    // Nunca ampliar: largura maior que o original so gera peso e borrao.
    const largura = Math.min(versao.largura, width)

    const info = await sharp(caminho)
      .resize(largura, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALIDADE, effort: ESFORCO })
      .toFile(resolve(destino, `${id}-${versao.sufixo}.webp`))

    gerados.push({ largura: info.width, altura: info.height, bytes: info.size })
  }

  const grande = gerados.at(-1)

  return {
    registro: {
      id,
      // Sem sufixo e sem extensao: quem completa e `urlFoto()`.
      caminho: `${slug}/${id}`,
      nome_original: basename(caminho),
      // As dimensoes da versao GRANDE, que e a proporcao que a grade reserva.
      largura: grande.largura,
      altura: grande.altura,
      lqip: await gerarLqip(caminho),
      ordem,
    },
    bytesEntrada: statSync(caminho).size,
    bytesSaida: gerados.reduce((s, g) => s + g.bytes, 0),
  }
}

// ---------------------------------------------------------------- publicacao

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
function popularDistComFotos() {
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
function projetoPagesExiste() {
  const r = spawnSync(
    process.execPath,
    [resolve(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'project', 'list'],
    { encoding: 'utf8' }
  )

  if (r.status !== 0) return false
  return (r.stdout ?? '').includes(PROJETO_PAGES)
}

function publicarNoPages() {
  rodarFerramenta(
    'node_modules/wrangler/bin/wrangler.js',
    ['pages', 'deploy', 'dist', `--project-name=${PROJETO_PAGES}`],
    'O deploy'
  )
}

// ---------------------------------------------------------------- principal

async function principal() {
  const { pasta, titulo, slug, local, semDeploy } = lerArgumentos()
  const opcoes = { local }

  const todos = readdirSync(pasta)
    .filter((n) => EXTENSOES.test(n))
    // Ordem alfabetica = ordem do cartao da camera = ordem cronologica do evento.
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

  if (todos.length === 0) {
    console.error(`\n  A pasta "${pasta}" nao tem nenhuma imagem.\n`)
    process.exit(1)
  }

  console.log(`\n== ${titulo} ==`)
  console.log(`   /e/${slug} — ${todos.length} fotos na pasta${local ? '  [banco local]' : ''}\n`)

  const evento = garantirEvento(slug, titulo, opcoes)
  const jaTem = fotosJaNoBanco(evento.id, opcoes)

  // A RETOMADA. O banco manda: o que ja esta la nao volta a ser processado.
  const arquivos = todos.filter((n) => !jaTem.nomes.has(n))
  const pulados = todos.length - arquivos.length

  if (pulados > 0) {
    console.log(`  ${pulados} ja estavam no banco — retomando da ${pulados + 1}.\n`)
  }

  const destino = resolve(PASTA_FOTOS, slug)
  mkdirSync(destino, { recursive: true })

  const registros = []
  let bytesEntrada = 0
  let bytesSaida = 0
  const comecou = Date.now()

  for (const [indice, arquivo] of arquivos.entries()) {
    const caminho = resolve(pasta, arquivo)

    try {
      const r = await processarFoto(caminho, slug, jaTem.proximaOrdem + indice, destino)

      registros.push(r.registro)
      bytesEntrada += r.bytesEntrada
      bytesSaida += r.bytesSaida

      console.log(
        `  ${String(indice + 1).padStart(4)}/${arquivos.length}  ` +
          `${arquivo.padEnd(28).slice(0, 28)}  ${kb(r.bytesEntrada)} -> ${kb(r.bytesSaida)}`
      )
    } catch (e) {
      /*
        Um arquivo com problema nao derruba o lote. Processar 500 fotos e perder
        tudo por causa de um JPEG corrompido no meio seria o pior resultado
        possivel — e a linha abaixo diz exatamente qual arquivo culpar.
      */
      console.log(
        `  ${String(indice + 1).padStart(4)}/${arquivos.length}  ${arquivo}  !! ${e.message}`
      )
    }
  }

  const minutos = ((Date.now() - comecou) / 60000).toFixed(1)

  /*
    O banco so e tocado DEPOIS de os arquivos existirem no disco.

    A ordem importa: uma linha no D1 apontando para um arquivo que nao existe
    produz uma foto quebrada na galeria, visivel para todo mundo. Um arquivo no
    disco sem linha no banco e invisivel — e a proxima execucao o encontra pelo
    `nome_original` e completa o registro.
  */
  if (registros.length > 0) {
    inserirFotos(evento.id, registros, opcoes)
    atualizarTotal(evento.id, opcoes)
  }

  const orfaos = limparOrfaos(slug, evento.id, destino, opcoes)
  if (orfaos > 0) {
    console.log(`  ${orfaos} arquivos orfaos de uma execucao anterior foram apagados.`)
  }

  escreverEspelho(evento.id, destino, opcoes)

  const totalArquivos = contarArquivosDoSite()
  const totalNoBanco = consultar(
    `select total_fotos from eventos where id = ${aspas(evento.id)};`,
    opcoes
  )[0]?.total_fotos

  console.log(
    `\n  ${registros.length} fotos novas em ${minutos} min` +
      (pulados > 0 ? ` (${pulados} ja estavam)` : '') +
      '\n' +
      (registros.length > 0
        ? `  ${mb(bytesEntrada)} de originais -> ${mb(bytesSaida)} em duas versoes\n` +
          `  ${(bytesSaida / registros.length / 1024).toFixed(0)} KB por foto` +
          `  (estimativa do plano: 480 KB)\n`
        : '') +
      `\n  O evento tem ${totalNoBanco} fotos no banco.\n` +
      `  O site tem ${totalArquivos.toLocaleString('pt-BR')} de ` +
      `${LIMITE_ARQUIVOS.toLocaleString('pt-BR')} arquivos.\n`
  )

  if (totalArquivos >= ALERTA_ARQUIVOS) {
    console.log(
      `  ATENCAO: passou de ${ALERTA_ARQUIVOS.toLocaleString('pt-BR')} arquivos.\n` +
        '  Hora de arquivar os eventos antigos (npm run arquivar) — apagar as\n' +
        '  versoes -g de quem tem mais de um ano libera ~94% dos arquivos deles.\n'
    )
  }

  /*
    Com `--local` o banco escrito foi o de teste desta maquina. Construir o site
    a partir dele produziria um `dist/` que nao corresponde a producao, entao a
    execucao para aqui.
  */
  if (local) {
    console.log('  Banco local: o site nao foi construido nem publicado.\n')
    return
  }

  console.log('  Construindo o site...\n')
  rodarFerramenta('node_modules/typescript/bin/tsc', ['-b'], 'A checagem de tipos')
  rodarFerramenta('node_modules/vite/bin/vite.js', ['build'], 'O build')

  const { arquivos: linkados, copiados } = popularDistComFotos()
  console.log(
    `\n  ${linkados.toLocaleString('pt-BR')} fotos em dist/fotos/` +
      (copiados > 0 ? ` (${copiados} por copia, ${linkados - copiados} por hardlink)` : ' (por hardlink)')
  )

  if (semDeploy) {
    console.log('\n  --sem-deploy: o site esta pronto em dist/, mas nao foi publicado.')
    console.log('  Para conferir antes: npm run preview\n')
    return
  }

  if (!projetoPagesExiste()) {
    console.log(
      `\n  O site esta pronto em dist/, mas o projeto Pages "${PROJETO_PAGES}" ainda\n` +
        '  nao existe — e o primeiro deploy o criaria sem perguntar, com o endereco\n' +
        '  publico que vai ser divulgado. Crie ele antes:\n\n' +
        `    npx wrangler pages project create ${PROJETO_PAGES} --production-branch=main\n\n` +
        '  Depois rode este comando de novo: as fotos ja processadas serao puladas\n' +
        '  e ele seguira direto para a publicacao.\n'
    )
    return
  }

  console.log()
  publicarNoPages()

  if (evento.status !== 'publicado') {
    console.log(
      `\n  O evento "${slug}" esta como RASCUNHO e ainda nao aparece no site.\n` +
        '  Publicar e decisao sua, depois de conferir a galeria. Enquanto o painel\n' +
        '  nao existe, o comando e:\n\n' +
        `    npx wrangler d1 execute ${'hub-eventos-ieq'} --remote --command ` +
        `"update eventos set status='publicado' where slug='${slug}'"\n`
    )
  }
}

principal().catch((e) => {
  console.error(`\n  Falhou: ${e.message}\n`)
  process.exit(1)
})

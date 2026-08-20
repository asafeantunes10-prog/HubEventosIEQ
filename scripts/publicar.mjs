/**
 * Prepara as fotos de um evento: le uma pasta de originais da camera e gera as
 * duas versoes WebP que viram ARQUIVOS DO SITE.
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
 * Uso:  npm run publicar "C:\\Fotos\\Culto de Jovens 2026"
 *
 * PENDENTE DA ETAPA 2: a insercao no D1, o hardlink de `fotos/` para `dist/` e
 * o `wrangler pages deploy` — todos dependem do `wrangler login` e do banco
 * criado na conta da Cloudflare. Ate la o script faz o processamento completo,
 * grava em `fotos/<slug>/` e escreve um `fotos.json` com os metadados, o que ja
 * permite conferir tamanho, tempo e qualidade antes de qualquer publicacao.
 */
import sharp from 'sharp'
import { readdirSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

const RAIZ = resolve(import.meta.dirname, '..')

/** Onde as fotos processadas moram. Fora do git — ver o aviso no `.gitignore`. */
const PASTA_FOTOS = resolve(RAIZ, 'fotos')

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
 * Quantos arquivos o site ja tem, somando todos os eventos.
 *
 * So conta `.webp`: e o que vai para o deploy e o que pesa contra o teto de
 * 20.000. Contar o `fotos.json` de cada evento inflaria o numero e faria o
 * alerta de arquivamento disparar cedo demais.
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

// ---------------------------------------------------------------- argumentos

function lerArgumentos() {
  const pastaBruta = process.argv[2]

  if (!pastaBruta) {
    console.error(
      '\n  Uso: npm run publicar "C:\\Fotos\\Culto de Jovens 2026"\n\n' +
        '  O nome da pasta vira o titulo do evento e o endereco no site.\n'
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

  return { pasta, titulo, slug }
}

// ---------------------------------------------------------------- processamento

async function processarFoto(caminho, slug, ordem, destino) {
  const { width } = await sharp(caminho).metadata()

  /*
    UUID curto, e nao o nome do arquivo. Duas razoes: nomes de camera se repetem
    entre cartoes (`IMG_0001` sai de todo cartao zerado), e uma chave que nunca
    muda deixa o navegador cachear a foto para sempre sem risco de mostrar uma
    imagem velha no lugar de outra.
  */
  const id = randomUUID().slice(0, 8)

  const gerados = []
  for (const versao of VERSOES) {
    // Nunca ampliar: largura maior que o original so gera peso e borrao.
    const largura = Math.min(versao.largura, width)

    const info = await sharp(caminho)
      .resize(largura, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALIDADE, effort: ESFORCO })
      .toFile(resolve(destino, `${id}-${versao.sufixo}.webp`))

    gerados.push({ sufixo: versao.sufixo, largura: info.width, altura: info.height, bytes: info.size })
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

async function principal() {
  const { pasta, titulo, slug } = lerArgumentos()

  const arquivos = readdirSync(pasta)
    .filter((n) => EXTENSOES.test(n))
    // Ordem alfabetica = ordem do cartao da camera = ordem cronologica do evento.
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

  if (arquivos.length === 0) {
    console.error(`\n  A pasta "${pasta}" nao tem nenhuma imagem.\n`)
    process.exit(1)
  }

  const destino = resolve(PASTA_FOTOS, slug)

  /*
    RECUSA rodar por cima de um evento que ja tem fotos.

    A retomabilidade de verdade — continuar da foto 300 de 500 comparando
    `nome_original` com o que ja esta no D1 — entra na etapa 2. Ate la, rodar o
    script duas vezes na mesma pasta geraria UUIDs novos para as mesmas fotos e
    DUPLICARIA tudo em silencio: 1.000 arquivos onde deviam existir 500, comendo
    o dobro do teto de 20.000 sem ninguem perceber.

    Falhar aqui e barato; descobrir a duplicata depois de publicar nao e.
  */
  if (existsSync(destino) && readdirSync(destino).some((n) => n.endsWith('.webp'))) {
    console.error(
      `\n  O evento "${slug}" ja tem fotos processadas em:\n  ${destino}\n\n` +
        '  Rodar de novo duplicaria todas elas (a retomada por nome entra na\n' +
        '  etapa 2, junto com o D1). Para refazer do zero, apague a pasta antes.\n'
    )
    process.exit(1)
  }

  mkdirSync(destino, { recursive: true })

  console.log(`\n== ${titulo} ==`)
  console.log(`   /e/${slug} — ${arquivos.length} fotos\n`)

  const registros = []
  let bytesEntrada = 0
  let bytesSaida = 0
  const comecou = Date.now()

  for (const [indice, arquivo] of arquivos.entries()) {
    const caminho = resolve(pasta, arquivo)

    try {
      const r = await processarFoto(caminho, slug, indice, destino)

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

  writeFileSync(
    resolve(destino, 'fotos.json'),
    JSON.stringify({ slug, titulo, total: registros.length, fotos: registros }, null, 2),
    'utf8'
  )

  const totalArquivos = contarArquivosDoSite()

  console.log(
    `\n  ${registros.length} de ${arquivos.length} fotos em ${minutos} min\n` +
      `  ${mb(bytesEntrada)} de originais -> ${mb(bytesSaida)} em duas versoes\n` +
      `  ${(bytesSaida / Math.max(registros.length, 1) / 1024).toFixed(0)} KB por foto` +
      `  (estimativa do plano: 480 KB)\n\n` +
      `  Gravado em ${destino}\n` +
      `  O site tem ${totalArquivos.toLocaleString('pt-BR')} de ${LIMITE_ARQUIVOS.toLocaleString('pt-BR')} arquivos.\n`
  )

  if (totalArquivos >= ALERTA_ARQUIVOS) {
    console.log(
      `  ATENCAO: passou de ${ALERTA_ARQUIVOS.toLocaleString('pt-BR')} arquivos.\n` +
        `  Hora de arquivar os eventos antigos (npm run arquivar) — apagar as\n` +
        `  versoes -g de quem tem mais de um ano libera ~94% dos arquivos deles.\n`
    )
  }

  console.log(
    `  O envio ao D1 e o deploy entram na etapa 2, quando a conta da Cloudflare existir.\n`
  )
}

principal().catch((e) => {
  console.error(`\n  Falhou: ${e.message}\n`)
  process.exit(1)
})

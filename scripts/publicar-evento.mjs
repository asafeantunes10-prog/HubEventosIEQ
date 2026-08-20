/**
 * Prepara as fotos de um evento: le uma pasta de originais da camera e gera as
 * tres versoes WebP que vao para o R2, mais o LQIP que vai para o banco.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Foto de camera vem grande e em JPEG. Servir o arquivo cru significa mandar
 * para o celular de alguem em 4G varias vezes mais bytes do que a tela dele
 * consegue mostrar. E 500 originais de um evento sao ~2,5 GB — um quarto dos
 * 10 GB gratuitos do R2 num evento so. Este script resolve as duas coisas:
 *
 *   1. Converte para WebP (mesma qualidade visual, ~30% do peso do JPEG).
 *   2. Gera tres larguras, cada uma com um proposito:
 *        t  400px  ~30 KB   a grade
 *        m 1080px ~130 KB   o visualizador em tela cheia
 *        g 2048px ~450 KB   o download e o ZIP
 *      Da ~610 KB por foto, ~305 MB num evento de 500 — cerca de 33 eventos
 *      nos 10 GB.
 *   3. Nunca aumenta a imagem: se o original tem 1600px, nao se inventa um
 *      2048px borrado so para preencher a tabela.
 *   4. Extrai um LQIP — uma miniatura de 20px, borrada, em base64. Ela vai
 *      embutida no JSON da galeria (nao custa requisicao nenhuma) e aparece
 *      instantaneamente enquanto a foto real carrega, no lugar do retangulo
 *      cinza. E o truque que faz o site "parecer" rapido em conexao ruim.
 *
 * O painel web faz exatamente o mesmo trabalho no navegador (ver
 * `src/lib/fotos.ts`); este script existe para as levas grandes, onde 500 fotos
 * numa aba seria pedir demais do navegador e da paciencia.
 *
 * Uso:  npm run publicar -- --evento <slug> --pasta "C:\\caminho\\das\\fotos"
 *
 * PENDENTE DA ETAPA 5: o envio ao R2 e a insercao no D1, que dependem do
 * `wrangler login` e dos recursos criados na conta da Cloudflare. Ate la o
 * script grava as versoes em `saida/<slug>/` e escreve um `fotos.json` com os
 * metadados — o que ja permite conferir tamanho, tempo e qualidade do pipeline
 * antes de qualquer byte subir.
 */
import sharp from 'sharp'
import { readdirSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

const RAIZ = resolve(import.meta.dirname, '..')

/** As tres versoes. Os mesmos numeros de `src/lib/fotos.ts` — se mudar um, mude o outro. */
const VERSOES = [
  { tamanho: 't', largura: 400 },
  { tamanho: 'm', largura: 1080 },
  { tamanho: 'g', largura: 2048 },
]

/**
 * 80 e o joelho da curva do WebP: abaixo disso o ceu e a pele comecam a mostrar
 * banding, acima o arquivo cresce sem diferenca visivel na tela.
 */
const QUALIDADE = 80

/** `effort: 6` gasta mais CPU aqui para o arquivo sair menor. Vale: o processamento
 *  acontece uma vez, o download acontece milhares. */
const ESFORCO = 6

const EXTENSOES = /\.(jpe?g|png|webp|tiff?|avif)$/i

// ---------------------------------------------------------------- utilitarios

function kb(bytes) {
  return (bytes / 1024).toFixed(0).padStart(5) + ' KB'
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
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

// ---------------------------------------------------------------- argumentos

function lerArgumentos() {
  const { values } = parseArgs({
    options: {
      evento: { type: 'string' },
      pasta: { type: 'string' },
      saida: { type: 'string' },
    },
  })

  if (!values.evento || !values.pasta) {
    console.error(
      '\n  Uso: npm run publicar -- --evento <slug> --pasta "C:\\caminho\\das\\fotos"\n\n' +
        '    --evento  slug do evento, como aparece no endereco (/e/<slug>)\n' +
        '    --pasta   pasta com os originais da camera\n' +
        '    --saida   onde gravar as versoes (padrao: saida/<slug>)\n'
    )
    process.exit(1)
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.evento)) {
    console.error(
      `\n  "${values.evento}" nao serve como slug.\n` +
        '  Use so minusculas, numeros e hifen: "culto-de-natal-2026".\n'
    )
    process.exit(1)
  }

  const pasta = resolve(values.pasta)
  if (!existsSync(pasta)) {
    console.error(`\n  Nao achei a pasta "${pasta}".\n`)
    process.exit(1)
  }

  return {
    evento: values.evento,
    pasta,
    saida: resolve(values.saida ?? resolve(RAIZ, 'saida', values.evento)),
  }
}

// ---------------------------------------------------------------- processamento

async function processarFoto(caminho, evento, ordem, destino) {
  const { width, height } = await sharp(caminho).metadata()

  /*
    UUID, e nao o nome do arquivo. Duas razoes: nomes de camera se repetem entre
    cartoes (`IMG_0001` sai de todo cartao zerado), e uma chave unica e o que
    permite mandar `Cache-Control: immutable` sem medo — a foto naquela chave
    nunca muda, entao o navegador nunca precisa perguntar de novo.
  */
  const uuid = randomUUID()
  const chave = `${evento}/${uuid}`

  const gerados = []
  for (const versao of VERSOES) {
    // Nunca ampliar: largura maior que o original so gera peso e borrao.
    const largura = Math.min(versao.largura, width)

    const info = await sharp(caminho)
      .resize(largura, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALIDADE, effort: ESFORCO })
      .toFile(resolve(destino, `${uuid}-${versao.tamanho}.webp`))

    gerados.push({ tamanho: versao.tamanho, largura: info.width, bytes: info.size })
  }

  const grande = gerados.at(-1)

  return {
    registro: {
      id: uuid,
      chave,
      extensao: 'webp',
      nome_original: basename(caminho),
      // As dimensoes da versao GRANDE, que e a proporcao que a grade reserva.
      largura: grande.largura,
      altura: Math.round((grande.largura / width) * height),
      lqip: await gerarLqip(caminho),
      ordem,
    },
    bytesEntrada: statSync(caminho).size,
    bytesSaida: gerados.reduce((s, g) => s + g.bytes, 0),
  }
}

async function principal() {
  const { evento, pasta, saida } = lerArgumentos()

  const arquivos = readdirSync(pasta)
    .filter((n) => EXTENSOES.test(n))
    // Ordem alfabetica = ordem do cartao da camera = ordem cronologica do evento.
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

  if (arquivos.length === 0) {
    console.error(`\n  A pasta "${pasta}" nao tem nenhuma imagem.\n`)
    process.exit(1)
  }

  mkdirSync(saida, { recursive: true })

  console.log(`\n== ${evento} — ${arquivos.length} fotos ==\n`)

  const registros = []
  let bytesEntrada = 0
  let bytesSaida = 0
  const comecou = Date.now()

  for (const [indice, arquivo] of arquivos.entries()) {
    const caminho = resolve(pasta, arquivo)

    try {
      const r = await processarFoto(caminho, evento, indice, saida)

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
        possivel — e o relatorio no fim diz exatamente qual arquivo culpar.
      */
      console.log(`  ${String(indice + 1).padStart(4)}/${arquivos.length}  ${arquivo}  !! ${e.message}`)
    }
  }

  const minutos = ((Date.now() - comecou) / 60000).toFixed(1)

  writeFileSync(
    resolve(saida, 'fotos.json'),
    JSON.stringify({ evento, total: registros.length, fotos: registros }, null, 2),
    'utf8'
  )

  console.log(
    `\n  ${registros.length} de ${arquivos.length} fotos em ${minutos} min\n` +
      `  ${mb(bytesEntrada)} de originais -> ${mb(bytesSaida)} em tres versoes\n` +
      `  ${(bytesSaida / registros.length / 1024).toFixed(0)} KB por foto (estimativa do plano: 610 KB)\n\n` +
      `  Gravado em ${saida}\n` +
      `  Metadados em ${resolve(saida, 'fotos.json')}\n\n` +
      `  O envio ao R2 e ao D1 entra na etapa 5, quando a conta da Cloudflare existir.\n`
  )
}

principal().catch((e) => {
  console.error(`\n  Falhou: ${e.message}\n`)
  process.exit(1)
})

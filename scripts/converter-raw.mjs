/**
 * Converte fotos RAW da camera (.ARW) para .jpg antes de publicar.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * `sharp` (o que `publicar.mjs` usa para processar as fotos) nao le RAW de
 * camera — so decodifica formato de imagem de verdade (JPEG, PNG, WebP,
 * TIFF). Um `.ARW` (Sony) na pasta e simplesmente ignorado pelo publicar, sem
 * aviso nenhum: a contagem de fotos nao muda e nada explica o motivo.
 *
 * A solucao NAO e decodificar o RAW de verdade (demosaicar um sensor Bayer e
 * um problema grande, e nenhuma biblioteca JS madura faz isso bem). A saida e
 * mais simples: toda foto tirada em RAW pela camera ja tem, embutida dentro
 * do proprio arquivo, uma PREVIA em JPEG — e o que a propria camera usa pra
 * mostrar a foto no visor. Este script so extrai essa previa. Ela nao chega
 * na resolucao do sensor inteiro, mas passa longe dos 2048px que o site usa
 * pra versao grande — pra uma galeria na web, e photo o bastante.
 *
 * O DETALHE QUE MORDEU UMA VEZ: a previa extraida vem SEM a tag de rotacao
 * (Orientation) do EXIF. A camera grava o sensor sempre deitado e guarda
 * "gire 90 pra mostrar em pe" como um FLAG separado no arquivo — e esse flag
 * mora no `.ARW`, nao dentro da previa. Extrair so a previa e esquecer desse
 * flag e a razao de uma foto vertical de verdade sair deitada no site. Este
 * script faz os dois passos sempre juntos: extrai a previa E copia a tag de
 * orientacao do ARW pra dentro dela. (O `.rotate()` em `publicar.mjs` faz a
 * outra metade: le essa tag e gira o pixel de verdade antes de redimensionar.
 * Sem os dois passos, nenhum dos dois resolve sozinho.)
 *
 * RETOMAVEL E SEM RISCO NO ORIGINAL: nunca apaga nem move o `.ARW`. Se o
 * `.jpg` de uma foto ja existe, ela e pulada — rodar de novo so cobre o que
 * ainda falta.
 *
 * Usa o ExifTool (github.com/exiftool/exiftool, licenca Perl Artistic/GPL),
 * vendorizado em `ferramentas/exiftool/` (fora do git — ver .gitignore).
 *
 * Uso:
 *   npm run converter-raw "C:\Fotos\Culto de Jovens 2026"
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, basename, extname } from 'node:path'

const EXIFTOOL = resolve(import.meta.dirname, '..', 'ferramentas', 'exiftool', 'exiftool.exe')

/** Arquivos por chamada do exiftool — folga generosa contra o teto de linha de comando do Windows. */
const TAMANHO_LOTE = 40

function lerArgumentos() {
  const pastaBruta = process.argv.slice(2).find((a) => !a.startsWith('--'))

  if (!pastaBruta) {
    console.error(
      '\n  Uso: npm run converter-raw "C:\\Fotos\\Culto de Jovens 2026"\n\n' +
        '  Acha os .ARW da pasta, extrai a previa em .jpg e corrige a rotacao.\n' +
        '  Os .ARW originais nunca sao tocados. Depois, publique normalmente:\n' +
        '  npm run publicar "a mesma pasta"\n'
    )
    process.exit(1)
  }

  const pasta = resolve(pastaBruta)
  if (!existsSync(pasta)) {
    console.error(`\n  Nao achei a pasta "${pasta}".\n`)
    process.exit(1)
  }

  return pasta
}

function conferirFerramenta() {
  if (existsSync(EXIFTOOL)) return

  console.error(
    `\n  Nao achei o ExifTool em "${EXIFTOOL}".\n\n` +
      '  Isso so falta numa maquina nova (o `ferramentas/` fica fora do git de\n' +
      '  proposito — e um binario de ~35 MB que nao muda, ver .gitignore).\n\n' +
      '  Resolve uma vez so:\n' +
      '    1. https://exiftool.org/ -> "Windows Executable" -> baixa o .zip\n' +
      '    2. Extrai o .zip INTEIRO (o exe E a pasta exiftool_files) para\n' +
      `       ${resolve(import.meta.dirname, '..', 'ferramentas', 'exiftool')}\n` +
      '    3. Renomeia "exiftool(-k).exe" para "exiftool.exe"\n\n' +
      '  Roda este comando de novo depois.\n'
  )
  process.exit(1)
}

/** Roda o exiftool e devolve stdout+stderr juntos — os avisos dele vem por stderr. */
function rodarExiftool(args) {
  const r = spawnSync(EXIFTOOL, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw new Error(`Nao consegui chamar o exiftool: ${r.error.message}`)
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}

function emLotes(lista, tamanho) {
  const lotes = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}

function principal() {
  const pasta = lerArgumentos()
  conferirFerramenta()

  const arws = readdirSync(pasta).filter((n) => /\.arw$/i.test(n))

  if (arws.length === 0) {
    console.log(`\n  Nenhum .ARW em "${pasta}". Nada pra converter.\n`)
    return
  }

  const pendentes = []
  const vazios = []
  let jaConvertidos = 0

  for (const arw of arws) {
    const caminhoArw = resolve(pasta, arw)
    const caminhoJpg = resolve(pasta, `${basename(arw, extname(arw))}.jpg`)

    if (existsSync(caminhoJpg)) {
      jaConvertidos++
      continue
    }

    // Cartao que falhou na gravacao deixa o arquivo criado, mas vazio — sem
    // isto o exiftool erra na extracao e a mensagem dele nao deixa claro que
    // o problema e o proprio arquivo, nao a ferramenta.
    if (statSync(caminhoArw).size === 0) {
      vazios.push(arw)
      continue
    }

    pendentes.push({ arw, caminhoArw, caminhoJpg })
  }

  console.log(`\n  ${arws.length} arquivos .ARW na pasta.`)
  if (jaConvertidos > 0) console.log(`  ${jaConvertidos} ja tinham .jpg — pulados.`)
  if (vazios.length > 0) {
    console.log(`  ${vazios.length} .ARW vazios/corrompidos, sem conserto possivel:`)
    for (const nome of vazios) console.log(`    - ${nome}`)
  }

  if (pendentes.length === 0) {
    console.log('\n  Nada novo pra converter.\n')
    return
  }

  console.log(`\n  Convertendo ${pendentes.length}...\n`)

  // Passo 1: extrai a previa embutida em cada .ARW como .jpg do lado dela.
  for (const lote of emLotes(pendentes, TAMANHO_LOTE)) {
    rodarExiftool(['-b', '-PreviewImage', '-w', 'jpg', ...lote.map((p) => p.caminhoArw)])
  }

  const semPrevia = pendentes.filter((p) => !existsSync(p.caminhoJpg))
  const comPrevia = pendentes.filter((p) => existsSync(p.caminhoJpg))

  // Passo 2: copia so a tag de rotacao do .ARW pra dentro do .jpg que acabou
  // de nascer — e o passo que falta pra `publicar.mjs` girar a foto certo.
  //
  // `-TagsFromFile %d%f.ARW` TEM que vir antes de `-Orientation<Orientation`:
  // sem ele, o exiftool tenta copiar a tag Orientation DE DENTRO DO PROPRIO
  // jpg (que nao tem nenhuma) — nao da erro, so um aviso silencioso ("No
  // writable tags set") que passa batido se ninguem checa a saida. Foi
  // exatamente essa falta que deixou passar um lote inteiro sem girar uma
  // vez — `%d%f` resolve pasta+nome do jpg sendo processado, so troca a
  // extensao para achar o `.ARW` irmao ao lado dele.
  for (const lote of emLotes(comPrevia, TAMANHO_LOTE)) {
    const saida = rodarExiftool([
      '-TagsFromFile',
      '%d%f.ARW',
      '-Orientation<Orientation',
      '-overwrite_original',
      ...lote.map((p) => p.caminhoJpg),
    ])

    // Rede de seguranca: se algum arquivo do lote nao recebeu a tag (ARW
    // sumiu, renomeado, o que for), avisa em vez de deixar a foto seguir
    // silenciosamente sem rotacao ate aparecer torta no site.
    if (saida.includes('No writable tags set')) {
      console.log(
        '  aviso: pelo menos um arquivo deste lote nao recebeu a tag de rotacao ' +
          '(o .ARW irmao pode ter sido movido/apagado) — confira o lote acima.'
      )
    }
  }

  console.log(`  ${comPrevia.length} convertidas com sucesso.`)
  if (semPrevia.length > 0) {
    console.log(`  ${semPrevia.length} nao tinham previa embutida pra extrair:`)
    for (const p of semPrevia) console.log(`    - ${p.arw}`)
  }

  console.log(
    `\n  Pronto. Os .ARW continuam intactos na pasta.\n` +
      `  Agora: npm run publicar "${pasta}"\n`
  )
}

principal()

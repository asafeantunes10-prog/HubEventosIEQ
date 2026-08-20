import { downloadZip } from 'client-zip'

/**
 * Monta o ZIP do evento inteiro NO NAVEGADOR de quem baixa, buscando cada foto
 * pela mesma rota que a galeria ja usa.
 *
 * POR QUE NAO NO SERVIDOR
 * Zipar 500 fotos de 450 KB significa mover 225 MB. Uma Pages Function tem
 * 10ms de CPU e memoria apertada — nao chega perto. E ainda seria o mesmo
 * trafego contado duas vezes: R2 -> funcao, funcao -> visitante. Aqui o arquivo
 * vai do R2 direto para o disco de quem pediu, e o unico custo e o download que
 * ele ia fazer de qualquer jeito.
 *
 * O CUSTO QUE IMPORTA: uma requisicao por foto. Um ZIP de 500 fotos gasta 500
 * das 100 mil requisicoes diarias de uma vez — cerca de 200 downloads completos
 * por dia. E bastante para uma igreja, mas e o numero que pode apertar num
 * evento muito concorrido, e o motivo de existir a chave `BASE_FOTOS` em
 * `urls.ts`.
 *
 * POR QUE `client-zip` E NAO `jszip`
 * O JSZip monta o arquivo inteiro em memoria antes de entregar: 200 fotos de
 * 8 MB sao 1,6 GB de heap, o que mata a aba em qualquer celular e boa parte dos
 * notebooks. O `client-zip` trabalha em fluxo — cada foto entra no ZIP e sai da
 * memoria em seguida. Pesa ~3 KB contra ~100 KB, e escreve direto no disco
 * quando o navegador oferece `showSaveFilePicker`.
 *
 * SEM COMPRESSAO, DE PROPOSITO
 * O `client-zip` so empacota (metodo "store"). JPEG e WebP ja sao formatos
 * comprimidos: passar deflate por cima gasta CPU para ganhar 1 ou 2 por cento.
 * O ZIP aqui serve para juntar as fotos num arquivo so, nao para encolher.
 */

export type FotoParaZip = {
  /** URL da versao grande (2048px) — a que vai para o disco. */
  url: string
  /** Nome do arquivo dentro do ZIP, ja com extensao. */
  nome: string
}

export type ProgressoZip = {
  concluidas: number
  total: number
}

/** Quantas fotos buscar adiantado enquanto o ZIP escreve as anteriores. */
const JANELA = 3

/**
 * Tipagem minima da File System Access API. O `lib.dom` do TypeScript ainda nao
 * a traz, e declarar so o que se usa e melhor que espalhar `any` pelo arquivo.
 */
type JanelaComPicker = Window & {
  showSaveFilePicker?: (opcoes: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandle>
}

/**
 * Gera as fotos uma a uma, mantendo `JANELA` downloads adiantados.
 *
 * Sequencial puro deixaria a rede ociosa entre uma foto e outra; tudo em
 * paralelo derrubaria o ganho de memoria que motivou o `client-zip`. Uma janela
 * pequena pega quase toda a velocidade sem nunca segurar mais que tres fotos ao
 * mesmo tempo.
 */
async function* buscarEmFluxo(
  fotos: FotoParaZip[],
  aoProgredir?: (p: ProgressoZip) => void,
  sinal?: AbortSignal
) {
  const fila: Promise<{ nome: string; resposta: Response }>[] = []

  const buscar = (foto: FotoParaZip) =>
    fetch(foto.url, { signal: sinal }).then((resposta) => {
      if (!resposta.ok) {
        throw new Error(`Não consegui baixar "${foto.nome}" (${resposta.status}).`)
      }
      return { nome: foto.nome, resposta }
    })

  for (let i = 0; i < Math.min(JANELA, fotos.length); i++) {
    fila.push(buscar(fotos[i]))
  }

  for (let i = 0; i < fotos.length; i++) {
    const { nome, resposta } = await fila[i]

    // Enfileira a proxima ANTES de entregar esta ao zipador: assim o download
    // seguinte ja esta em andamento enquanto o ZIP consome o atual.
    const proxima = i + JANELA
    if (proxima < fotos.length) fila.push(buscar(fotos[proxima]))

    yield { name: nome, input: resposta }

    aoProgredir?.({ concluidas: i + 1, total: fotos.length })
  }
}

/** Nomes repetidos dentro de um ZIP confundem o descompactador — numera-os. */
export function nomesUnicos(nomes: string[]): string[] {
  const vistos = new Map<string, number>()

  return nomes.map((nome) => {
    const chave = nome.toLowerCase()
    const visto = vistos.get(chave) ?? 0
    vistos.set(chave, visto + 1)
    if (visto === 0) return nome

    const ponto = nome.lastIndexOf('.')
    return ponto === -1
      ? `${nome} (${visto})`
      : `${nome.slice(0, ponto)} (${visto})${nome.slice(ponto)}`
  })
}

export type ResultadoZip = {
  salvo: boolean
  cancelado: boolean
  /**
   * `true` quando a pessoa ESCOLHEU um local, o navegador barrou a escrita
   * ali, e o arquivo acabou na pasta de downloads.
   *
   * A tela precisa saber disso para dizer onde o ZIP foi parar. Sem o aviso, a
   * pessoa vai procurar na pasta que escolheu, encontrar o arquivo vazio de
   * 0 byte que o proprio seletor criou antes de falhar, e concluir que o
   * download nao funcionou — enquanto o ZIP bom esta em Downloads.
   */
  caiuParaDownloads: boolean
}

/**
 * Os tres desfechos possiveis da tentativa de gravar direto no disco.
 *
 * Escrito como uniao, e nao como `ResultadoZip | null`, porque sao tres coisas
 * diferentes, e e facil confundir duas delas: "a pessoa desistiu" e
 * "nao deu, tenta pelo outro caminho" voltavam ambas como ausencia de sucesso,
 * e o codigo chamador tinha que adivinhar qual era.
 */
type TentativaDisco =
  | { tipo: 'salvo' }
  | { tipo: 'cancelado' }
  /** `aposEscolher` diz se a pessoa chegou a escolher um local antes de falhar. */
  | { tipo: 'queda'; aposEscolher: boolean }

/**
 * Tenta o caminho bom: gravar direto no disco, em fluxo.
 *
 * POR QUE A DESISTENCIA E TRATADA SEPARADO DA FALHA
 * `AbortError` e a pessoa fechando o dialogo de "salvar como". Cair para o
 * Blob nesse caso baixaria o arquivo assim mesmo, contrariando quem acabou de
 * dizer que nao queria — e mostrar "erro ao baixar" seria mentira. Por isso a
 * desistencia encerra a operacao, e so o resto vira queda.
 */
async function tentarSalvarNoDisco(
  fotos: FotoParaZip[],
  nomeArquivo: string,
  janela: JanelaComPicker,
  aoProgredir?: (p: ProgressoZip) => void,
  sinal?: AbortSignal
): Promise<TentativaDisco> {
  if (typeof janela.showSaveFilePicker !== 'function') {
    return { tipo: 'queda', aposEscolher: false }
  }

  let handle: FileSystemFileHandle
  try {
    handle = await janela.showSaveFilePicker({
      suggestedName: nomeArquivo,
      types: [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }],
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { tipo: 'cancelado' }

    console.warn('[zip] showSaveFilePicker falhou, usando o download comum:', e)
    // Nenhum arquivo chegou a ser criado, entao nao ha rastro a limpar nem
    // aviso a dar: para quem baixou foi um download normal.
    return { tipo: 'queda', aposEscolher: false }
  }

  /*
    `createWritable` e o ponto que mais falha na pratica, com
    `NotAllowedError: The request is not allowed by the user agent or the
    platform in the current context`. Acontece por motivos que o site nao
    controla nem consegue prever: pasta protegida pelo sistema, arquivo aberto
    em outro programa, politica de empresa no navegador, ou perfil com a API
    restrita.

    Aqui e uma QUEDA, nao um erro. Nada foi baixado ainda neste ponto, entao
    voltar para o caminho do Blob nao desperdicia nenhum trafego — e a pessoa
    recebe o ZIP na pasta de downloads em vez de onde escolheu, o que e
    infinitamente melhor que uma mensagem de erro e nenhum arquivo.

    Nao e hipotetico: e o modo de falha mais comum desta API. Sem este `catch`
    o erro cru do navegador sobe ate a tela e o download morre, com a queda
    pronta e inalcancavel logo abaixo.
  */
  let escrita: FileSystemWritableFileStream
  try {
    escrita = await handle.createWritable()
  } catch (e) {
    console.warn('[zip] createWritable falhou, usando o download comum:', e)

    /*
      LIMPA O RASTRO. O seletor ja criou o arquivo, com 0 byte, no instante em
      que a pessoa confirmou o nome — antes mesmo de sabermos que a escrita
      seria barrada. Sem esta remocao ele fica no disco parecendo um download
      que deu errado: a pessoa abre o arquivo vazio, ve um ZIP sem nada dentro,
      e nao tem como adivinhar que o arquivo bom esta em Downloads.

      `remove()` e recente (Chrome 110+) e pode nao existir ou ser recusado.
      Falhar aqui nao muda nada de importante — o download continua — entao o
      erro morre neste `catch`.
    */
    try {
      await (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.()
    } catch {
      // Sem permissao para apagar: sobra o arquivo vazio, e o aviso na tela
      // explica onde esta o bom.
    }

    return { tipo: 'queda', aposEscolher: true }
  }

  try {
    const corpo = downloadZip(buscarEmFluxo(fotos, aoProgredir, sinal)).body
    if (!corpo) throw new Error('Não consegui preparar o arquivo.')
    await corpo.pipeTo(escrita)
  } catch (e) {
    // Daqui para frente NAO ha queda: o download ja comecou, e recomecar do
    // zero pelo outro caminho baixaria tudo de novo. Falhou, falhou.
    // `pipeTo` fecha a escrita quando da certo; num erro ela fica aberta e o
    // arquivo pela metade ficaria travado no disco.
    await escrita.abort().catch(() => {})
    throw e
  }

  return { tipo: 'salvo' }
}

/**
 * Baixa todas as fotos num ZIP.
 *
 * Dois caminhos, e a diferenca entre eles importa:
 *
 * 1. `showSaveFilePicker` (Chrome, Edge, Opera): a pessoa escolhe onde salvar
 *    ANTES de comecar, e os bytes vao do R2 para o disco em fluxo. Um evento de
 *    5 GB funcionaria num computador com 4 GB de RAM.
 * 2. Queda (Firefox, Safari, ou quando o caminho 1 e barrado pela maquina):
 *    monta o Blob inteiro em memoria e so entao dispara o download. Um evento
 *    de 500 fotos da ~225 MB e passa tranquilo; e a razao de a tela oferecer
 *    tambem o download foto a foto se um dia nao passar.
 */
export async function baixarEventoEmZip(
  fotos: FotoParaZip[],
  nomeArquivo: string,
  aoProgredir?: (p: ProgressoZip) => void,
  sinal?: AbortSignal
): Promise<ResultadoZip> {
  if (fotos.length === 0) throw new Error('Não há fotos para baixar.')

  const comNomes = nomesUnicos(fotos.map((f) => f.nome)).map((nome, i) => ({
    url: fotos[i].url,
    nome,
  }))

  const tentativa = await tentarSalvarNoDisco(
    comNomes,
    nomeArquivo,
    window as JanelaComPicker,
    aoProgredir,
    sinal
  )

  if (tentativa.tipo === 'salvo') {
    return { salvo: true, cancelado: false, caiuParaDownloads: false }
  }
  if (tentativa.tipo === 'cancelado') {
    return { salvo: false, cancelado: true, caiuParaDownloads: false }
  }

  const blob = await downloadZip(buscarEmFluxo(comNomes, aoProgredir, sinal)).blob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()

  // Um `revoke` imediato cancelaria o download antes de ele comecar em alguns
  // navegadores. O minuto e folga de sobra e a memoria volta sozinha depois.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

  return { salvo: true, cancelado: false, caiuParaDownloads: tentativa.aposEscolher }
}

/** Download de UMA foto. Usado no botao do cartao e no visualizador. */
export async function baixarUma(url: string, nome: string): Promise<void> {
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error('Não consegui baixar a foto.')

  const blob = await resposta.blob()
  const objeto = URL.createObjectURL(blob)

  /*
    Passa pelo Blob em vez de apontar o link direto para a foto. Com
    `BASE_FOTOS` em `function` a origem e a mesma e o `<a download>` bastaria,
    mas nas outras duas estrategias (`r2dev`, `dominio`) ela deixa de ser — e
    para outro dominio o navegador IGNORA o atributo `download` por seguranca.
    Sem isto, trocar a estrategia faria o botao "baixar" passar a ABRIR a foto
    numa aba em vez de salva-la, sem ninguem mudar uma linha desta tela.
  */
  const link = document.createElement('a')
  link.href = objeto
  link.download = nome
  link.click()

  setTimeout(() => URL.revokeObjectURL(objeto), 60_000)
}

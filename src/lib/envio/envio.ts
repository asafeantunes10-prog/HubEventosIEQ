import {
  enviarLoteDeArquivos,
  estadoDoArmazenamento,
  publicarFotos,
  registrarFotos,
  type FotoParaRegistrar,
} from '@/lib/apiAdmin'
import { ErroApi } from '@/lib/api'

import { classificar } from './formatos.ts'
import { lerHoraDaFoto } from './metadados.ts'
import { PoolDeProcessamento } from './poolDeProcessamento.ts'
import type { ImagemProcessada } from './processarImagem.ts'

/**
 * O orquestrador de um envio de fotos: pega os arquivos escolhidos e leva cada um
 * ate o ar, mostrando o que acontece com CADA arquivo no caminho.
 *
 *   arquivo -> processa (worker) -> manda ao deposito -> registra no banco -> deploy
 *
 * QUATRO REGRAS que existem por causa do primeiro evento:
 *
 *  1. Nenhum arquivo some. Todo arquivo escolhido termina com um estado visivel:
 *     no ar, ja enviado antes, ou erro COM O MOTIVO. O script antigo descartava
 *     em silencio o que nao reconhecia.
 *  2. Um arquivo ruim nao derruba o lote. A foto 300 corrompida vira um erro na
 *     linha 300 e as outras 499 seguem.
 *  3. O banco so ouve falar de uma foto DEPOIS de ela estar no deposito, e o
 *     site publico so a mostra DEPOIS do deploy. Nunca ha linha apontando para
 *     arquivo que nao existe.
 *  4. Interromper e seguro. O que ja foi registrado fica, e enviar a mesma pasta
 *     de novo pula o que ja foi (`chaveOrigem`), sem duplicar.
 */

export type SituacaoItem =
  | 'na-fila'
  | 'processando'
  | 'pronta'
  | 'enviando'
  | 'enviada'
  | 'registrada'
  | 'no-ar'
  | 'erro'
  | 'ja-enviada'

export type ItemDeEnvio = {
  /** `nome|tamanho|ultima modificacao` — a mesma chave que o banco guarda. */
  chave: string
  nome: string
  tamanho: number
  tipo: 'imagem' | 'raw'
  situacao: SituacaoItem
  erro?: string
  avisos: string[]
}

export type FaseDoEnvio =
  | 'ocioso'
  | 'preparando'
  | 'enviando'
  | 'publicando'
  | 'concluido'
  | 'cancelado'

export type EstadoDoEnvio = {
  fase: FaseDoEnvio
  itens: ItemDeEnvio[]
  /** Arquivos que nao sao foto aceita, com o motivo. Nunca somem em silencio. */
  descartados: { nome: string; motivo: string }[]
  /** `.xmp`, `.thm` e companhia: contados, nao listados como erro. */
  ignorados: number
  /** Aviso ou erro geral (sessao expirada, deploy recusado...). */
  mensagem: string | null
  /** Bytes de WebP que ja foram para o deposito. */
  bytesEnviados: number
  /** `true` quando ha foto registrada que ainda nao foi para o ar. */
  haPendentes: boolean
}

type Interno = ItemDeEnvio & {
  arquivo: File
  /** Posicao na ordem final da galeria (hora da foto, depois nome). */
  posicao: number
  resultado?: ImagemProcessada
  idFoto?: string
}

/** O teto do corpo de um lote (a Function aceita 30 MB; o resto e margem). */
const BYTES_POR_LOTE = 22 * 1024 * 1024
const FOTOS_POR_LOTE = 40
const LOTES_EM_PARALELO = 3
/** Quantas fotos prontas (~0,9 MB cada em base64) podem esperar vez de subir. */
const MAXIMO_NA_MEMORIA = 60
const TENTATIVAS_DE_ENVIO = 5
/**
 * Fotos sendo processadas ao mesmo tempo. Um a mais que os workers do pool, para
 * sempre haver uma esperando na fila quando um worker termina.
 */
const PROCESSADORES = 4

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function chaveDoArquivo(arquivo: File): string {
  return `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}`
}

/** 12 digitos hexa, o formato que o servidor valida (`ID_FOTO`). */
function novoIdDeFoto(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Uma "campainha": quem espera uma condicao dorme aqui ate alguem avisar que algo
 * mudou. Evita laco de espera ocupada.
 */
class Campainha {
  private esperando: (() => void)[] = []

  esperar(): Promise<void> {
    return new Promise((r) => this.esperando.push(r))
  }

  tocar(): void {
    for (const r of this.esperando.splice(0)) r()
  }
}

class ErroFatal extends Error {}

export class EnvioDeFotos {
  private readonly eventoId: string
  private readonly chavesExistentes: Set<string>

  private itens: Interno[] = []
  private descartados: { nome: string; motivo: string }[] = []
  private ignorados = 0
  private fase: FaseDoEnvio = 'ocioso'
  private mensagem: string | null = null
  private bytesEnviados = 0
  private haPendentes = false

  private pool: PoolDeProcessamento | null = null
  private cancelado = false
  private ouvintes = new Set<() => void>()
  private foto: EstadoDoEnvio
  private notificacaoAgendada = false

  // --- estado do pipeline ---
  private aProcessar: Interno[] = []
  private prontas: Interno[] = []
  private processando = 0
  private enviandoAgora = 0
  private processamentoAcabou = false
  private ponteiroDeRegistro = 0
  private registrando: Promise<void> = Promise.resolve()
  private readonly campainhaDeProntas = new Campainha()
  private readonly campainhaDeEspaco = new Campainha()

  /**
   * @param chavesExistentes `chaveOrigem` das fotos que o evento ja tem (inclusive as
   *        registradas e ainda fora do ar) — sao puladas, e e isso que torna seguro
   *        enviar a mesma pasta duas vezes.
   * @param haPendentes ha foto registrada esperando deploy (sobrou de um envio
   *        interrompido).
   */
  constructor(eventoId: string, chavesExistentes: Iterable<string>, haPendentes = false) {
    this.eventoId = eventoId
    this.chavesExistentes = new Set(chavesExistentes)
    this.haPendentes = haPendentes
    this.foto = this.montarFoto()
  }

  // ----------------------------------------------------------- estado para a tela

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  /** Mesma referencia enquanto nada mudar — exigencia do `useSyncExternalStore`. */
  estado = (): EstadoDoEnvio => this.foto

  private montarFoto(): EstadoDoEnvio {
    return {
      fase: this.fase,
      itens: this.itens.map((i) => ({
        chave: i.chave,
        nome: i.nome,
        tamanho: i.tamanho,
        tipo: i.tipo,
        situacao: i.situacao,
        erro: i.erro,
        avisos: i.avisos,
      })),
      descartados: this.descartados,
      ignorados: this.ignorados,
      mensagem: this.mensagem,
      bytesEnviados: this.bytesEnviados,
      haPendentes: this.haPendentes,
    }
  }

  /**
   * Avisa a tela. Agrupa as mudancas: 500 fotos mudando de estado varias vezes por
   * segundo reconstruiriam a lista inteira a cada uma.
   */
  private notificar(imediato = false): void {
    const agora = () => {
      this.notificacaoAgendada = false
      this.foto = this.montarFoto()
      for (const o of this.ouvintes) o()
    }
    if (imediato) return agora()
    if (this.notificacaoAgendada) return
    this.notificacaoAgendada = true
    setTimeout(agora, 120)
  }

  // ----------------------------------------------------------------- entrada

  /** Roda o envio completo de uma pilha de arquivos escolhidos pela pessoa. */
  async enviar(arquivos: File[]): Promise<void> {
    if (this.fase === 'preparando' || this.fase === 'enviando' || this.fase === 'publicando') {
      throw new Error('Já há um envio em andamento.')
    }

    this.cancelado = false
    this.mensagem = null
    this.fase = 'preparando'
    this.processamentoAcabou = false
    this.ponteiroDeRegistro = 0
    this.prontas = []
    this.processando = 0
    this.enviandoAgora = 0

    // Uma rodada nova recomeca a lista; o que ja foi enviado esta no banco.
    this.itens = []
    this.descartados = []
    this.ignorados = 0
    this.notificar(true)

    const novos = this.classificarArquivos(arquivos)
    await this.ordenar(novos)

    this.itens = novos
    this.aProcessar = novos.filter((i) => i.situacao === 'na-fila')
    this.notificar(true)

    if (this.aProcessar.length === 0) {
      this.fase = 'concluido'
      this.mensagem =
        novos.length === 0 && this.descartados.length === 0
          ? 'Nenhuma foto nova nesta seleção.'
          : this.mensagem
      this.notificar(true)
      return
    }

    this.fase = 'enviando'
    this.pool = new PoolDeProcessamento()
    this.notificar(true)

    try {
      const processadores = Array.from({ length: PROCESSADORES }, () => this.lacoDeProcessamento())
      const enviadores = Array.from({ length: LOTES_EM_PARALELO }, () => this.lacoDeEnvio())

      await Promise.all(processadores)
      this.processamentoAcabou = true
      this.campainhaDeProntas.tocar()
      await Promise.all(enviadores)
      await this.registrando

      await this.fecharRegistro()
    } catch (e) {
      this.mensagem = e instanceof Error ? e.message : 'O envio falhou.'
      this.interromperPendentes(this.mensagem)
    } finally {
      this.pool?.encerrar()
      this.pool = null
    }

    if (this.cancelado) {
      this.interromperPendentes(this.mensagem ?? 'Envio cancelado antes de terminar.')
      this.fase = 'cancelado'
      this.mensagem ??= 'Envio cancelado. O que já foi enviado continua guardado.'
      this.notificar(true)
      return
    }

    await this.publicar()
  }

  cancelar(): void {
    this.abortar(null)
  }

  /** Para o pipeline e acorda quem esta esperando, para os lacos poderem sair. */
  private abortar(motivo: string | null): void {
    if (motivo) this.mensagem = motivo
    this.cancelado = true
    this.pool?.encerrar()
    this.campainhaDeEspaco.tocar()
    this.campainhaDeProntas.tocar()
    this.notificar()
  }

  /** Poe no ar o que ja esta registrado (usado depois de um cancelamento ou de um deploy que falhou). */
  async publicarAgora(): Promise<void> {
    if (this.fase === 'enviando' || this.fase === 'preparando' || this.fase === 'publicando') return
    this.cancelado = false
    await this.publicar()
  }

  // -------------------------------------------------------------- preparacao

  private classificarArquivos(arquivos: File[]): Interno[] {
    const vistos = new Set<string>()
    const itens: Interno[] = []

    for (const arquivo of arquivos) {
      const classe = classificar(arquivo.webkitRelativePath || arquivo.name)

      if (classe.tipo === 'ignorar') {
        this.ignorados++
        continue
      }
      if (classe.tipo === 'nao-suportado') {
        this.descartados.push({ nome: arquivo.name, motivo: classe.motivo })
        continue
      }

      const chave = chaveDoArquivo(arquivo)
      // O mesmo arquivo escolhido duas vezes na mesma selecao conta uma so.
      if (vistos.has(chave)) continue
      vistos.add(chave)

      itens.push({
        chave,
        nome: arquivo.name,
        tamanho: arquivo.size,
        tipo: classe.tipo,
        situacao: this.chavesExistentes.has(chave) ? 'ja-enviada' : 'na-fila',
        avisos: [],
        arquivo,
        posicao: 0,
      })
    }

    return itens
  }

  /**
   * Ordem da galeria: hora em que a foto foi tirada, e o nome como desempate.
   *
   * Importa com mais de uma camera no evento: ordenar so pelo nome poria as 300
   * fotos da Sony inteiras antes das 200 da Canon. Quando o arquivo nao traz hora
   * legivel, vale a data de modificacao (a camera grava o arquivo na hora do
   * clique, e copiar para o PC preserva).
   */
  private async ordenar(itens: Interno[]): Promise<void> {
    const chaves = new Map<Interno, string>()
    const fila = itens.filter((i) => i.situacao === 'na-fila')

    // Lê so o cabecalho de cada arquivo, poucos de cada vez.
    let proximo = 0
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (proximo < fila.length) {
          const item = fila[proximo++]
          const hora = await lerHoraDaFoto(item.arquivo).catch(() => null)
          chaves.set(item, hora ?? this.horaDeModificacao(item.arquivo))
        }
      })
    )

    const comHora = (i: Interno) => chaves.get(i) ?? this.horaDeModificacao(i.arquivo)
    itens.sort(
      (a, b) =>
        comHora(a).localeCompare(comHora(b)) ||
        a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })
    )
    itens.forEach((item, indice) => (item.posicao = indice))
  }

  private horaDeModificacao(arquivo: File): string {
    const d = new Date(arquivo.lastModified)
    const p = (n: number, c = 2) => String(n).padStart(c, '0')
    return (
      `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    )
  }

  // ------------------------------------------------------------ processamento

  private async lacoDeProcessamento(): Promise<void> {
    while (!this.cancelado) {
      // Sem espaco na memoria, espera os envios esvaziarem a fila.
      while (
        !this.cancelado &&
        this.prontas.length + this.enviandoAgora >= MAXIMO_NA_MEMORIA
      ) {
        await this.campainhaDeEspaco.esperar()
      }
      if (this.cancelado) return

      const item = this.aProcessar.shift()
      if (!item) return

      this.processando++
      this.mudar(item, 'processando')

      try {
        item.resultado = await this.pool!.processar(item.arquivo)
        item.avisos = item.resultado.avisos
        this.mudar(item, 'pronta')
        this.prontas.push(item)
        this.campainhaDeProntas.tocar()
      } catch (e) {
        if (!this.cancelado) this.falhar(item, e instanceof Error ? e.message : 'Falha ao processar.')
      } finally {
        this.processando--
      }
    }
  }

  // ------------------------------------------------------------------- envio

  private async lacoDeEnvio(): Promise<void> {
    while (!this.cancelado) {
      if (this.prontas.length === 0) {
        if (this.processamentoAcabou) return
        await this.campainhaDeProntas.esperar()
        continue
      }

      // Poucas fotos prontas e o processamento ainda rodando: espera um instante
      // para juntar um lote melhor em vez de gastar uma requisicao por foto.
      if (this.prontas.length < 6 && !this.processamentoAcabou) {
        await dormir(700)
        if (this.cancelado) return
      }

      const lote = this.tirarLote()
      if (lote.length === 0) continue

      this.enviandoAgora += lote.length
      try {
        await this.enviarLote(lote)
      } catch (e) {
        // Erro que nao adianta repetir (sessao expirada, servidor sem configuracao):
        // para tudo, em vez de deixar os processadores presos esperando espaco.
        if (!(e instanceof ErroFatal)) throw e
        this.abortar(e.message)
      } finally {
        this.enviandoAgora -= lote.length
        this.campainhaDeEspaco.tocar()
      }
    }
  }

  private tirarLote(): Interno[] {
    // Do mais antigo da galeria para o mais novo: o registro anda na mesma ordem.
    this.prontas.sort((a, b) => a.posicao - b.posicao)

    const lote: Interno[] = []
    let bytes = 0
    while (this.prontas.length > 0 && lote.length < FOTOS_POR_LOTE) {
      const proxima = this.prontas[0]
      const tamanho = this.bytesDoLote(proxima)
      if (lote.length > 0 && bytes + tamanho > BYTES_POR_LOTE) break
      bytes += tamanho
      lote.push(this.prontas.shift()!)
    }
    return lote
  }

  private bytesDoLote(item: Interno): number {
    const r = item.resultado!
    return r.grande.base64.length + r.miniatura.base64.length + 400
  }

  private async enviarLote(lote: Interno[]): Promise<void> {
    for (const item of lote) this.mudar(item, 'enviando')

    const corpo = JSON.stringify(
      lote.flatMap((item) => {
        const r = item.resultado!
        return [r.miniatura, r.grande].map((v) => ({
          key: v.hash,
          value: v.base64,
          metadata: { contentType: 'image/webp' },
          base64: true,
        }))
      })
    )

    let ultimoErro: unknown
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_ENVIO && !this.cancelado; tentativa++) {
      try {
        await enviarLoteDeArquivos(corpo)

        for (const item of lote) {
          this.bytesEnviados += item.resultado!.grande.bytes + item.resultado!.miniatura.bytes
          item.idFoto = novoIdDeFoto()
          this.mudar(item, 'enviada')
        }
        this.agendarRegistro()
        return
      } catch (e) {
        ultimoErro = e
        // Sem login (ou sem configuracao) nao adianta insistir.
        if (e instanceof ErroApi && [401, 403, 503].includes(e.status)) {
          throw new ErroFatal(
            e.status === 401
              ? 'Sua sessão expirou. Entre de novo (pode ser em outra aba) e envie a pasta outra vez: o que já foi enviado é pulado.'
              : e.message
          )
        }
        await dormir(2 ** tentativa * 1000)
      }
    }

    const motivo =
      ultimoErro instanceof Error ? ultimoErro.message : 'Não consegui mandar esta foto ao servidor.'
    for (const item of lote) this.falhar(item, motivo)
  }

  // ---------------------------------------------------------------- registro

  /**
   * Grava no banco, na ordem da galeria, as fotos que ja estao no deposito.
   *
   * "Na ordem" porque o servidor numera `ordem` pela ordem em que as fotos
   * chegam. Uma foto que terminou antes das anteriores espera aqui. Uma foto com
   * erro nao trava a fila: o ponteiro passa por cima dela.
   */
  private agendarRegistro(): void {
    this.registrando = this.registrando
      .then(() => this.registrarPronto())
      .catch((e) => {
        this.abortar(e instanceof Error ? e.message : 'Não consegui gravar as fotos.')
      })
  }

  private async registrarPronto(): Promise<void> {
    for (;;) {
      // Avanca por cima do que nunca vai ser registrado.
      while (this.ponteiroDeRegistro < this.itens.length) {
        const s = this.itens[this.ponteiroDeRegistro].situacao
        if (s === 'erro' || s === 'ja-enviada') this.ponteiroDeRegistro++
        else break
      }

      const grupo: Interno[] = []
      let p = this.ponteiroDeRegistro
      while (p < this.itens.length && this.itens[p].situacao === 'enviada' && grupo.length < 100) {
        grupo.push(this.itens[p])
        p++
      }
      if (grupo.length === 0) return

      await registrarFotos(this.eventoId, grupo.map((i) => this.paraRegistro(i)))

      for (const item of grupo) {
        this.chavesExistentes.add(item.chave)
        this.mudar(item, 'registrada')
        // O resultado ocupa memoria; depois de gravado nao serve mais.
        item.resultado = undefined
      }
      this.haPendentes = true
      this.ponteiroDeRegistro = p
    }
  }

  private paraRegistro(item: Interno): FotoParaRegistrar {
    const r = item.resultado!
    return {
      id: item.idFoto!,
      nomeOriginal: item.nome,
      chaveOrigem: item.chave,
      largura: r.largura,
      altura: r.altura,
      lqip: r.lqip,
      hashT: r.miniatura.hash,
      hashG: r.grande.hash,
      capturadaEm: r.capturadaEm,
    }
  }

  /** No fim, o que sobrou no meio de buracos (erros) tambem precisa ser gravado. */
  private async fecharRegistro(): Promise<void> {
    this.agendarRegistro()
    await this.registrando
  }

  // ------------------------------------------------------------- publicacao

  private async publicar(): Promise<void> {
    this.fase = 'publicando'
    this.mensagem = null
    this.notificar(true)

    try {
      const { deploymentId, situacao: inicial } = await publicarFotos()
      let situacao = inicial

      // Passou do tempo que o servidor espera? Continua perguntando daqui.
      for (let i = 0; i < 60 && situacao === 'andamento'; i++) {
        await dormir(3000)
        const estado = await estadoDoArmazenamento(deploymentId)
        situacao = estado.situacao ?? 'andamento'
      }

      if (situacao === 'pronto') {
        for (const item of this.itens) if (item.situacao === 'registrada') this.mudar(item, 'no-ar')
        this.haPendentes = false
        this.fase = 'concluido'
        this.mensagem = null
      } else if (situacao === 'falhou') {
        this.fase = 'concluido'
        this.mensagem =
          'O Cloudflare recusou a publicação. As fotos estão guardadas; use “Publicar agora” para tentar de novo.'
      } else {
        this.fase = 'concluido'
        this.mensagem =
          'A publicação está demorando mais que o normal. Confira o painel em alguns minutos.'
      }
    } catch (e) {
      this.fase = 'concluido'
      this.mensagem =
        (e instanceof Error ? e.message : 'Não consegui publicar.') +
        ' As fotos estão guardadas; use “Publicar agora” para tentar de novo.'
    }

    this.notificar(true)
  }

  // ----------------------------------------------------------------- helpers

  private mudar(item: Interno, situacao: SituacaoItem): void {
    item.situacao = situacao
    this.notificar()
  }

  private falhar(item: Interno, motivo: string): void {
    item.erro = motivo
    item.resultado = undefined
    this.mudar(item, 'erro')
  }

  /** Marca como interrompido tudo que ainda nao chegou ao banco. */
  private interromperPendentes(motivo: string): void {
    for (const item of this.itens) {
      if (
        item.situacao === 'na-fila' ||
        item.situacao === 'processando' ||
        item.situacao === 'pronta' ||
        item.situacao === 'enviando' ||
        // Chegou ao deposito mas nao ao banco: sem registro a foto nao existe.
        item.situacao === 'enviada'
      ) {
        this.falhar(item, motivo)
      }
    }
  }

  /** Arquivos que falharam, para o botao "tentar de novo". */
  arquivosComErro(): File[] {
    return this.itens.filter((i) => i.situacao === 'erro').map((i) => i.arquivo)
  }
}

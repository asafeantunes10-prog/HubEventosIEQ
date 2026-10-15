import type { ImagemProcessada } from './processarImagem.ts'
import type { PedidoDeProcessamento, RespostaDeProcessamento } from './protocolo.ts'

/**
 * Um punhado de Web Workers que processam fotos em paralelo.
 *
 * QUANTOS
 * Cada worker segura uma foto inteira decodificada (um ARW de 26 MP sao ~100 MB
 * de pixels, mais as copias intermediarias). Mais que uns poucos disputam
 * memoria e CPU sem acelerar nada, e um notebook modesto comeria swap. Por isso
 * o teto de 3 e a metade dos nucleos, o que for menor.
 */
export function quantosWorkers(): number {
  const nucleos = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return Math.max(1, Math.min(3, Math.floor(nucleos / 2)))
}

type Pendente = {
  pedido: PedidoDeProcessamento
  resolver: (r: ImagemProcessada) => void
  rejeitar: (e: Error) => void
}

type Slot = {
  worker: Worker
  ocupado: Pendente | null
}

export class PoolDeProcessamento {
  private slots: Slot[] = []
  private fila: Pendente[] = []
  private proximoId = 1
  private encerrado = false

  private readonly tamanho: number

  constructor(tamanho = quantosWorkers()) {
    this.tamanho = tamanho
  }

  /** Processa uma foto. Rejeita com uma mensagem ja em portugues. */
  processar(arquivo: File): Promise<ImagemProcessada> {
    if (this.encerrado) return Promise.reject(new Error('O envio foi cancelado.'))

    return new Promise((resolver, rejeitar) => {
      this.fila.push({ pedido: { id: this.proximoId++, arquivo }, resolver, rejeitar })
      this.despachar()
    })
  }

  /** Quantas fotos estao sendo processadas agora ou esperando vez. */
  get emAndamento(): number {
    return this.fila.length + this.slots.filter((s) => s.ocupado).length
  }

  encerrar(): void {
    this.encerrado = true
    for (const p of this.fila.splice(0)) p.rejeitar(new Error('O envio foi cancelado.'))
    for (const s of this.slots) {
      s.ocupado?.rejeitar(new Error('O envio foi cancelado.'))
      s.worker.terminate()
    }
    this.slots = []
  }

  private criarSlot(): Slot {
    const worker = new Worker(new URL('./trabalhador.ts', import.meta.url), { type: 'module' })
    const slot: Slot = { worker, ocupado: null }

    worker.onmessage = (e: MessageEvent<RespostaDeProcessamento>) => {
      const atual = slot.ocupado
      if (!atual || atual.pedido.id !== e.data.id) return
      slot.ocupado = null

      if (e.data.ok) atual.resolver(e.data.resultado)
      else atual.rejeitar(new Error(e.data.erro))

      this.despachar()
    }

    // Queda do worker (falta de memoria, por exemplo): a foto em andamento falha
    // com uma mensagem clara e o slot e recriado, em vez de o lote inteiro parar.
    worker.onerror = (e) => {
      e.preventDefault()
      const atual = slot.ocupado
      slot.ocupado = null
      worker.terminate()
      this.slots = this.slots.filter((s) => s !== slot)

      atual?.rejeitar(
        new Error(
          'O navegador ficou sem memória ao processar esta foto. Tente de novo, ou feche outras abas.'
        )
      )
      this.despachar()
    }

    this.slots.push(slot)
    return slot
  }

  private despachar(): void {
    if (this.encerrado) return

    while (this.fila.length > 0) {
      let slot = this.slots.find((s) => !s.ocupado)
      if (!slot && this.slots.length < this.tamanho) slot = this.criarSlot()
      if (!slot) return

      const proximo = this.fila.shift()!
      slot.ocupado = proximo
      slot.worker.postMessage(proximo.pedido)
    }
  }
}

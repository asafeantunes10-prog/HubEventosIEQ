/// <reference lib="webworker" />
import { classificar } from './formatos.ts'
import type { PedidoDeProcessamento, RespostaDeProcessamento } from './protocolo.ts'
import { processarImagem } from './processarImagem.ts'

/**
 * O Web Worker que processa uma foto por vez.
 *
 * Existe para a tela nao travar: decodificar, reduzir e codificar uma foto de
 * 26 megapixels leva segundos, e feito na thread principal congelaria os botoes
 * e a barra de progresso durante todo o envio.
 *
 * O codigo de RAW (LibRaw, alguns MB de WASM) so e carregado quando aparece o
 * primeiro RAW — um lote de JPEG nunca paga por ele.
 */

const trabalhador = self as unknown as DedicatedWorkerGlobalScope

function mensagemDe(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Erro desconhecido ao processar a foto.'
}

trabalhador.onmessage = async (evento: MessageEvent<PedidoDeProcessamento>) => {
  const { id, arquivo } = evento.data

  try {
    const classe = classificar(arquivo.name)

    let resultado
    if (classe.tipo === 'raw') {
      const { decodificarRaw } = await import('./decodificarRaw.ts')
      resultado = await processarImagem(await decodificarRaw(arquivo, classe.extensao))
    } else if (classe.tipo === 'imagem') {
      resultado = await processarImagem({ tipo: 'arquivo', blob: arquivo })
    } else {
      throw new Error('Este arquivo não é uma foto que eu saiba enviar.')
    }

    const resposta: RespostaDeProcessamento = { id, ok: true, resultado }
    trabalhador.postMessage(resposta)
  } catch (e) {
    const resposta: RespostaDeProcessamento = { id, ok: false, erro: mensagemDe(e) }
    trabalhador.postMessage(resposta)
  }
}

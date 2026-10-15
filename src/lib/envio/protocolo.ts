import type { ImagemProcessada } from './processarImagem.ts'

/** O que a tela manda ao worker. */
export type PedidoDeProcessamento = {
  id: number
  arquivo: File
}

/** O que o worker devolve. `erro` ja vem em portugues, pronto para a tela. */
export type RespostaDeProcessamento =
  | { id: number; ok: true; resultado: ImagemProcessada }
  | { id: number; ok: false; erro: string }

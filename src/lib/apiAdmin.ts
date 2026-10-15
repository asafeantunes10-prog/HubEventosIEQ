import { ErroApi, paraEvento, paraFoto, type LinhaEvento, type LinhaFoto } from '@/lib/api'
import type { Evento, Foto, LayoutEvento, StatusEvento } from '@/lib/tipos'

/**
 * O cliente das rotas `/api/admin/*`.
 *
 * Reusa a MESMA traducao snake_case -> camelCase de `api.ts` (`paraEvento`,
 * `paraFoto`) — o painel le e escreve os mesmos formatos que o site publico
 * le, so que com escrita e mais campos visiveis de uma vez.
 */

/**
 * Diferente de `buscarJson` em `api.ts`: aqui o corpo do erro tem uma mensagem
 * escrita pela Function (`{ erro: "..." }`) que vale a pena mostrar direto —
 * "Ja existe um evento com esse endereco" diz mais que um numero de status.
 */
async function chamarApi<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: { 'content-type': 'application/json', ...(opcoes?.headers as Record<string, string>) },
  })

  if (!resposta.ok) {
    let mensagem = 'Não consegui falar com o servidor agora. Tente de novo em instantes.'
    try {
      const corpo: unknown = await resposta.json()
      if (corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string') {
        mensagem = corpo.erro
      }
    } catch {
      // Resposta sem corpo JSON — fica com a mensagem generica.
    }
    throw new ErroApi(mensagem, resposta.status)
  }

  // DELETE e o PATCH de reordenar devolvem 204, sem corpo para ler.
  if (resposta.status === 204) return undefined as T

  return resposta.json()
}

/** Um evento como a lista do admin precisa: todos os status, com a capa resolvida. */
export type EventoAdmin = Evento & {
  capaCaminho: string | null
  capaLqip: string | null
}

export async function listarEventosAdmin(): Promise<EventoAdmin[]> {
  const linhas = await chamarApi<
    (LinhaEvento & { capa_caminho: string | null; capa_lqip: string | null })[]
  >('/api/admin/eventos')

  return linhas.map((linha) => ({
    ...paraEvento(linha),
    capaCaminho: linha.capa_caminho,
    capaLqip: linha.capa_lqip,
  }))
}

/**
 * Onde a foto esta na fila de publicacao (`no_ar` no banco, ver
 * `migrations/0003_armazenamento.sql`). So o painel enxerga as que ainda nao
 * estao no ar; o site publico as esconde.
 */
export type SituacaoFoto = 'no-ar' | 'pendente' | 'em-publicacao'

export type FotoAdmin = Foto & {
  situacao: SituacaoFoto
  /** `nome|tamanho|ultima modificacao` do arquivo enviado — serve para nao reenviar. */
  chaveOrigem: string | null
}

export type EventoAdminComFotos = { evento: Evento; fotos: FotoAdmin[] }

type LinhaFotoAdmin = LinhaFoto & { no_ar: number; chave_origem: string | null }

const SITUACOES: Record<number, SituacaoFoto> = { 0: 'pendente', 1: 'no-ar', 2: 'em-publicacao' }

export async function buscarEventoAdmin(id: string): Promise<EventoAdminComFotos> {
  const dados = await chamarApi<{ evento: LinhaEvento; fotos: LinhaFotoAdmin[] }>(
    `/api/admin/eventos/${encodeURIComponent(id)}`
  )

  return {
    evento: paraEvento(dados.evento),
    fotos: dados.fotos.map((linha) => ({
      ...paraFoto(linha),
      situacao: SITUACOES[linha.no_ar] ?? 'no-ar',
      chaveOrigem: linha.chave_origem,
    })),
  }
}

export type NovoEvento = {
  slug: string
  titulo: string
  descricao?: string | null
  dataEvento?: string | null
  corDestaque?: string | null
  layout?: LayoutEvento
}

export async function criarEvento(dados: NovoEvento): Promise<Evento> {
  const linha = await chamarApi<LinhaEvento>('/api/admin/eventos', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
  return paraEvento(linha)
}

/** Qualquer subconjunto dos campos editaveis — o PATCH so toca no que vier aqui. */
export type AtualizacaoEvento = Partial<{
  titulo: string
  descricao: string | null
  dataEvento: string | null
  status: StatusEvento
  listado: boolean
  destaque: boolean
  permiteZip: boolean
  /** So liga: arquivar tira as versoes grandes do ar e nao tem volta pelo painel. */
  arquivado: boolean
  corDestaque: string | null
  layout: LayoutEvento
  capaId: string | null
}>

export async function atualizarEvento(id: string, mudancas: AtualizacaoEvento): Promise<Evento> {
  const linha = await chamarApi<LinhaEvento>(`/api/admin/eventos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mudancas),
  })
  return paraEvento(linha)
}

/**
 * Apaga o evento (e suas fotos, em cascata no banco).
 *
 * Os arquivos so saem do ar no proximo deploy do projeto de fotos — quem chama
 * isto deve chamar `publicarFotos()` em seguida. Ver o comentario completo em
 * `functions/api/admin/eventos/[id].ts`.
 */
export async function apagarEvento(id: string): Promise<void> {
  await chamarApi<void>(`/api/admin/eventos/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function reordenarFotos(eventoId: string, ordemIds: string[]): Promise<void> {
  await chamarApi<void>(`/api/admin/eventos/${encodeURIComponent(eventoId)}/fotos`, {
    method: 'PATCH',
    body: JSON.stringify({ ordem: ordemIds }),
  })
}

// ---------------------------------------------------------------- envio de fotos

/** Uma foto ja processada e mandada ao deposito, pronta para ser registrada no banco. */
export type FotoParaRegistrar = {
  id: string
  nomeOriginal: string
  chaveOrigem: string
  largura: number
  altura: number
  lqip: string
  hashT: string
  hashG: string
  capturadaEm: string | null
}

/**
 * Manda um lote de arquivos ao deposito do projeto de fotos.
 *
 * `corpo` ja e o JSON no formato da API do Pages (lista de
 * `{ key, value, metadata, base64 }`) — o servidor so o repassa, sem ler.
 */
export async function enviarLoteDeArquivos(corpo: string): Promise<void> {
  await chamarApi<void>('/api/admin/armazenamento/enviar', { method: 'POST', body: corpo })
}

export async function registrarFotos(
  eventoId: string,
  fotos: FotoParaRegistrar[]
): Promise<{ registradas: number; jaExistiam: number }> {
  return chamarApi(`/api/admin/eventos/${encodeURIComponent(eventoId)}/fotos`, {
    method: 'POST',
    body: JSON.stringify({ fotos }),
  })
}

export async function apagarFotos(eventoId: string, ids: string[]): Promise<{ apagadas: number }> {
  return chamarApi(`/api/admin/eventos/${encodeURIComponent(eventoId)}/fotos`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export type SituacaoDeploy = 'pronto' | 'falhou' | 'andamento'

export type RespostaPublicacao = {
  deploymentId: string
  situacao: SituacaoDeploy
  arquivos: number
}

/** Poe no ar tudo que esta na fila (e tira do ar o que foi apagado). */
export async function publicarFotos(): Promise<RespostaPublicacao> {
  return chamarApi('/api/admin/armazenamento/publicar', { method: 'POST' })
}

export type EstadoArmazenamento = {
  situacao: SituacaoDeploy | null
  arquivos: number
  limite: number
  pendentes: number
}

export async function estadoDoArmazenamento(deploymentId?: string): Promise<EstadoArmazenamento> {
  const consulta = deploymentId ? `?deployment=${encodeURIComponent(deploymentId)}` : ''
  return chamarApi(`/api/admin/armazenamento/estado${consulta}`)
}

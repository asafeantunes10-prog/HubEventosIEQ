import { ErroApi, paraEvento, paraFoto, type LinhaEvento, type LinhaFoto } from '@/lib/api'
import type { Evento, EventoComFotos, LayoutEvento, StatusEvento } from '@/lib/tipos'

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

export async function buscarEventoAdmin(id: string): Promise<EventoComFotos> {
  const dados = await chamarApi<{ evento: LinhaEvento; fotos: LinhaFoto[] }>(
    `/api/admin/eventos/${encodeURIComponent(id)}`
  )

  return { evento: paraEvento(dados.evento), fotos: dados.fotos.map(paraFoto) }
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
 * Apaga o REGISTRO do evento (e suas fotos, em cascata no banco).
 *
 * Nao apaga arquivo nenhum do disco nem do site publicado — ver o comentario
 * completo em `functions/api/admin/eventos/[id].ts`. A tela que chama isto
 * precisa avisar sobre essa diferenca antes de confirmar.
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

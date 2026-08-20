import type { Foto, TamanhoFoto } from '@/lib/tipos'

/**
 * De onde as fotos sao servidas. E a chave de troca do projeto inteiro.
 *
 * O site nasce sem dominio proprio, e o endereco `r2.dev` do bucket e
 * declaradamente so para desenvolvimento: tem limite variavel de requisicoes e
 * devolve 429 quando aperta. Divulgar isso no Instagram seria pedir para
 * quebrar no pior momento.
 *
 * Por isso o padrao e `function`: uma Pages Function le o objeto pelo binding
 * de R2, por dentro da Cloudflare, sem passar pelo `r2.dev` — o limite dele nao
 * se aplica. O teto passa a ser o do plano gratuito de Functions, 100 mil
 * requisicoes por dia, e cache imutavel mais paginacao de 60 fotos mantem uma
 * visita a uma galeria em ~62 requisicoes.
 *
 * Se um dia a quota apertar, trocar de estrategia e trocar UMA variavel de
 * ambiente — nenhuma tela precisa mudar:
 *
 *   function  Pages Function `/img/*`. Padrao. 100k req/dia, cache no edge.
 *   r2dev     URL publica `r2.dev`. Nao gasta Function, mas limita por rajada.
 *   dominio   Dominio proprio ligado ao R2. Requisicoes e banda ilimitadas.
 *
 * Gatilhos para pegar um dominio: o painel da Cloudflare passar de ~60% das
 * requisicoes diarias, ou alguem relatar foto que nao carrega em dia de pico.
 */
export type BaseFotos = 'function' | 'r2dev' | 'dominio'

const BASE: BaseFotos = (import.meta.env.VITE_BASE_FOTOS as BaseFotos) || 'function'

/**
 * Endereco publico do bucket, usado apenas quando `BASE` nao e `function`.
 * Fica em variavel, e nao no codigo, porque muda junto com a estrategia.
 */
const ORIGEM_EXTERNA = (import.meta.env.VITE_ORIGEM_FOTOS as string | undefined)?.replace(/\/+$/, '')

/** Caminho do objeto no R2: `<evento>/<uuid>-t.webp`. */
export function caminhoFoto(foto: Foto, tamanho: TamanhoFoto): string {
  return `${foto.chave}-${tamanho}.${foto.extensao}`
}

export function urlFoto(foto: Foto, tamanho: TamanhoFoto): string {
  const caminho = caminhoFoto(foto, tamanho)

  if (BASE === 'function') return `/img/${caminho}`

  if (!ORIGEM_EXTERNA) {
    /*
      Cair para a Function e melhor que devolver uma URL quebrada: a foto
      aparece, so nao pela rota que se pretendia. O aviso no console e para
      quem trocou a variavel pela metade descobrir na hora, e nao pelo relato
      de um visitante.
    */
    console.warn(
      `[urls] VITE_BASE_FOTOS="${BASE}" exige VITE_ORIGEM_FOTOS. Usando /img/* enquanto isso.`
    )
    return `/img/${caminho}`
  }

  return `${ORIGEM_EXTERNA}/${caminho}`
}

/** Nome do arquivo que o visitante ve ao salvar a foto no disco. */
export function nomeParaDownload(foto: Foto, indice: number, slugEvento: string): string {
  const base = foto.nomeOriginal?.replace(/\.[^.]+$/, '')
  return `${slugEvento}-${String(indice + 1).padStart(3, '0')}${base ? `-${base}` : ''}.${foto.extensao}`
}

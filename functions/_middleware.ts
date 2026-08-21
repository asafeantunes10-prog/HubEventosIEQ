import type { Env } from './tipos'
import { urlFoto } from '../src/lib/fotos'

/**
 * Roda para TODO caminho do site — exceto os que o Cloudflare Pages ja resolve
 * como asset estatico ANTES de consultar Functions (`/fotos/*`, `/assets/*`,
 * favicon, robots.txt: eles existem fisicamente no deploy, entao o Pages os
 * exclui do roteamento por conta propria). Nenhuma foto passa por aqui.
 *
 * Duas coisas acontecem, e as duas so fazem sentido juntas:
 *
 *   1. `/e/:slug` ganha meta tags OG DE VERDADE — titulo, descricao e a capa
 *      do evento — antes de a pagina sair do servidor. Sem isso, colar o link
 *      no Instagram ou no WhatsApp mostra sempre o mesmo texto generico e
 *      nenhuma imagem, e e justamente por ali que as pessoas chegam.
 *   2. Qualquer caminho que NAO bate com nenhuma rota do app ganha um status
 *      404 de verdade. Sem isso, o Pages devolve o mesmo `index.html` com 200
 *      para qualquer endereco sem asset correspondente — e o que permite
 *      `/e/:slug` sobreviver a um recarregamento direto, mas tambem faz um
 *      link com erro de digitacao responder como se fosse uma pagina valida.
 *      O corpo continua sendo a mesma casca do SPA (so o status muda), entao
 *      quem abre no navegador ve `NaoEncontrada.tsx`; so um bot ou uma
 *      ferramenta de compartilhamento enxerga a diferenca no cabecalho.
 *
 * Esta lista precisa concordar com as rotas de `src/App.tsx`. Uma rota nova la
 * que nao entrar aqui carrega certinho, mas sai com um 404 no cabecalho.
 */
const ROTAS_CONHECIDAS = [
  /^\/$/,
  /^\/admin\/?$/,
  /^\/admin\/eventos\/novo\/?$/,
  /^\/admin\/eventos\/[^/]+\/?$/,
]

type LinhaEventoOg = {
  titulo: string
  descricao: string | null
  capa_caminho: string | null
  arquivado: number
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url)
  const caminho = url.pathname

  // /api/* tem suas proprias respostas (JSON de verdade) — nunca mexer aqui.
  if (caminho.startsWith('/api/')) {
    return next()
  }

  const resposta = await next()

  // So a casca HTML do SPA interessa daqui para baixo.
  if (!(resposta.headers.get('content-type') ?? '').includes('text/html')) {
    return resposta
  }

  const doEvento = caminho.match(/^\/e\/([^/]+)\/?$/)
  if (doEvento) {
    return reescreverParaEvento(resposta, doEvento[1], env, url)
  }

  if (ROTAS_CONHECIDAS.some((rota) => rota.test(caminho))) {
    return resposta
  }

  return paginaComStatus(resposta, 404)
}

/** Mesmo corpo, status novo — usado tanto para rota inexistente quanto para slug inexistente. */
function paginaComStatus(resposta: Response, status: number): Response {
  return new Response(resposta.body, { status, statusText: 'Not Found', headers: resposta.headers })
}

async function reescreverParaEvento(
  resposta: Response,
  slug: string,
  env: Env,
  url: URL
): Promise<Response> {
  const evento = await env.BANCO.prepare(
    `select e.titulo, e.descricao, e.arquivado,
            coalesce(capa.caminho, primeira.caminho) as capa_caminho
     from eventos e
     left join fotos capa on capa.id = e.capa_id
     left join fotos primeira
       on primeira.evento_id = e.id
      and primeira.ordem = (select min(ordem) from fotos where evento_id = e.id)
     where e.slug = ?1 and e.status = 'publicado'`
  )
    .bind(slug)
    .first<LinhaEventoOg>()

  if (!evento) {
    // Slug sem evento publicado: a MESMA casca (o React chama a API, recebe
    // 404 e mostra "nao encontrei esse evento" — ver `Evento.tsx`), so que
    // agora com o status HTTP contando a mesma historia.
    return paginaComStatus(resposta, 404)
  }

  const tituloPagina = `${evento.titulo} — Fotos dos Eventos IEQ`
  const descricaoPagina = evento.descricao?.trim() || 'Veja e baixe as fotos deste evento.'
  // Evento arquivado: a versao -g da capa foi apagada (ver `scripts/arquivar.mjs`).
  // A miniatura -t e menor do que o ideal para uma previa, mas e a unica que
  // ainda existe — bem melhor que a imagem quebrada que um 404 causaria.
  const imagemAbsoluta = evento.capa_caminho
    ? new URL(urlFoto(evento.capa_caminho, evento.arquivado ? 't' : 'g'), url.origin).toString()
    : null
  const urlAbsoluta = new URL(url.pathname, url.origin).toString()

  let extrasDoHead = `<meta property="og:url" content="${escaparAtributo(urlAbsoluta)}">`
  if (imagemAbsoluta) {
    extrasDoHead +=
      `<meta property="og:image" content="${escaparAtributo(imagemAbsoluta)}">` +
      `<meta name="twitter:image" content="${escaparAtributo(imagemAbsoluta)}">`
  }

  return new HTMLRewriter()
    .on('title', substituirTexto(tituloPagina))
    .on('meta[name="description"]', substituirAtributo('content', descricaoPagina))
    .on('meta[property="og:title"]', substituirAtributo('content', tituloPagina))
    .on('meta[property="og:description"]', substituirAtributo('content', descricaoPagina))
    .on('head', adicionarNoHead(extrasDoHead))
    .transform(resposta)
}

/**
 * So os valores montados aqui (origem da requisicao + caminho da foto) passam
 * por isto — nunca `titulo`/`descricao` do banco, que o `setAttribute` e o
 * `setInnerContent` do HTMLRewriter ja escapam sozinhos por tratarem o valor
 * como texto puro, nao como HTML.
 */
function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function substituirTexto(texto: string): HTMLRewriterElementContentHandlers {
  return {
    element(el) {
      el.setInnerContent(texto)
    },
  }
}

function substituirAtributo(nome: string, valor: string): HTMLRewriterElementContentHandlers {
  return {
    element(el) {
      el.setAttribute(nome, valor)
    },
  }
}

function adicionarNoHead(html: string): HTMLRewriterElementContentHandlers {
  return {
    element(el) {
      el.append(html, { html: true })
    },
  }
}

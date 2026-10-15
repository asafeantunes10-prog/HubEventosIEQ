import type { Env } from '../tipos'
import { CABECALHOS_FOTOS } from './cabecalhosFotos'

/**
 * Conversa com a API do Cloudflare Pages para atualizar o projeto de FOTOS.
 *
 * POR QUE UM PROJETO SO PARA AS FOTOS
 * Uma foto nova so chega ao ar dentro de um deploy do Pages. Um deploy feito por
 * API precisa levar junto o codigo das Functions (`_worker.bundle`); sem ele o
 * site perderia o servidor. Entao as fotos moram num projeto separado, sem
 * Function nenhuma — so arquivos —, e este modulo e o unico que sabe como
 * atualiza-lo. O site (`eventos-ieq`) continua sendo publicado por
 * `npm run implantar`, e nao leva mais foto nenhuma.
 *
 * O PROTOCOLO e o mesmo que o `wrangler pages deploy` usa (conferido no codigo
 * dele): pegar um JWT de upload, mandar os arquivos novos, registrar os hashes
 * e criar o deployment com um `manifest` que lista TODOS os arquivos do site.
 * O hash de um arquivo e `blake3(base64(conteudo) + extensao)`, 32 primeiros
 * caracteres hexadecimais — ver `src/lib/envio/hashPages.ts`.
 *
 * Nada aqui pode ser caro em CPU: Pages Functions tem 10 ms. Por isso o
 * manifesto nunca e montado como objeto — chega como TEXTO ja pronto, gerado
 * pelo SQL, e e repassado sem passar por `JSON.parse`.
 */

export const PROJETO_FOTOS = 'eventos-ieq-fotos'

/** Teto de arquivos por projeto Pages no plano gratuito. */
export const LIMITE_ARQUIVOS = 20_000

const API_PADRAO = 'https://api.cloudflare.com/client/v4'

/**
 * `CF_API_BASE` existe so para testar o fluxo inteiro sem tocar na conta real:
 * apontada para um servidor local que imita a API do Pages, ela deixa o
 * `wrangler pages dev` exercitar envio, manifesto e deploy de verdade. Em
 * producao nunca e definida.
 */
function api(env: Env): string {
  return env.CF_API_BASE || API_PADRAO
}

export type EnvArmazenamento = Env & { CF_API_TOKEN: string; CF_ACCOUNT_ID: string }

export function armazenamentoConfigurado(env: Env): env is EnvArmazenamento {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID)
}

export const RESPOSTA_NAO_CONFIGURADO = () =>
  Response.json(
    { erro: 'O envio de fotos ainda nao foi configurado (faltam CF_API_TOKEN e CF_ACCOUNT_ID).' },
    { status: 503 }
  )

type RespostaCloudflare<T> = {
  success: boolean
  errors?: { code: number; message: string }[]
  result: T
}

/** Resume os erros da API numa frase para a tela, sem despejar o JSON inteiro. */
function mensagemDeErro(corpo: unknown, status: number): string {
  const erros = (corpo as RespostaCloudflare<unknown> | null)?.errors
  if (Array.isArray(erros) && erros.length > 0) {
    return erros.map((e) => `${e.message} (${e.code})`).join('; ')
  }
  return `A Cloudflare respondeu ${status}.`
}

export class ErroPaginas extends Error {
  constructor(
    mensagem: string,
    readonly status: number
  ) {
    super(mensagem)
  }
}

async function lerJson<T>(resposta: Response): Promise<T> {
  let corpo: RespostaCloudflare<T> | null = null
  try {
    corpo = await resposta.json()
  } catch {
    // Resposta sem JSON (erro de gateway, por exemplo): cai na mensagem generica.
  }
  if (!resposta.ok || !corpo?.success) {
    throw new ErroPaginas(mensagemDeErro(corpo, resposta.status), resposta.status)
  }
  return corpo.result
}

function cabecalhosDoToken(env: EnvArmazenamento): HeadersInit {
  return { authorization: `Bearer ${env.CF_API_TOKEN}` }
}

/**
 * O JWT que autoriza mandar arquivos ao projeto. Vale por pouco tempo, entao e
 * pedido a cada operacao: um subrequest a mais e bem mais barato que um envio
 * que morre no meio por token vencido.
 */
async function obterJwtDeUpload(env: EnvArmazenamento): Promise<string> {
  const resposta = await fetch(
    `${api(env)}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${PROJETO_FOTOS}/upload-token`,
    { headers: cabecalhosDoToken(env) }
  )
  const { jwt } = await lerJson<{ jwt: string }>(resposta)
  return jwt
}

/**
 * Repassa um lote de arquivos para `/pages/assets/upload`, em fluxo.
 *
 * O navegador monta o corpo no formato que a API espera (lista de
 * `{ key, value (base64), metadata, base64: true }`); aqui o corpo so atravessa,
 * sem ser lido — repassar um fluxo nao custa CPU, interpretar 20 MB de JSON
 * custaria mais que os 10 ms que existem.
 */
export async function repassarUpload(
  env: EnvArmazenamento,
  corpo: ReadableStream,
  tamanho: string
): Promise<void> {
  const jwt = await obterJwtDeUpload(env)

  const resposta = await fetch(`${api(env)}/pages/assets/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
      // Sem o tamanho declarado o fetch usaria transferencia em pedacos, que
      // nem todo ponto da API aceita.
      'content-length': tamanho,
    },
    body: corpo,
  })
  await lerJson<unknown>(resposta)
}

/** `hashesJson` e o texto `{"hashes":["...","..."]}`, ja montado. */
export async function registrarHashes(env: EnvArmazenamento, hashesJson: string): Promise<void> {
  const jwt = await obterJwtDeUpload(env)
  const resposta = await fetch(`${api(env)}/pages/assets/upsert-hashes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: hashesJson,
  })
  await lerJson<unknown>(resposta)
}

export type EstagioDeploy = { name: string; status: string }

export type Deployment = {
  id: string
  latest_stage?: EstagioDeploy
  stages?: EstagioDeploy[]
}

/** `manifestoJson` e o texto `{"/fotos/x/y-t.webp":"hash", ...}`, ja montado. */
export async function criarDeployment(
  env: EnvArmazenamento,
  manifestoJson: string
): Promise<Deployment> {
  const form = new FormData()
  form.append('manifest', manifestoJson)
  // `main` e a branch de producao do projeto (ver o comando de criacao no README).
  form.append('branch', 'main')
  form.append('_headers', new Blob([CABECALHOS_FOTOS], { type: 'text/plain' }), '_headers')

  const resposta = await fetch(
    `${api(env)}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${PROJETO_FOTOS}/deployments`,
    { method: 'POST', headers: cabecalhosDoToken(env), body: form }
  )
  return lerJson<Deployment>(resposta)
}

export async function buscarDeployment(env: EnvArmazenamento, id: string): Promise<Deployment> {
  const resposta = await fetch(
    `${api(env)}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${PROJETO_FOTOS}/deployments/${encodeURIComponent(id)}`,
    { headers: cabecalhosDoToken(env) }
  )
  return lerJson<Deployment>(resposta)
}

export type SituacaoDeploy = 'pronto' | 'falhou' | 'andamento'

/**
 * Traduz o estagio do deployment. Um deploy direto passa por poucos estagios;
 * ele esta de pe quando o `deploy` termina com sucesso, e perdido quando
 * qualquer estagio falha ou e cancelado.
 */
export function situacaoDoDeploy(d: Deployment): SituacaoDeploy {
  const estagios = d.stages ?? (d.latest_stage ? [d.latest_stage] : [])

  if (estagios.some((e) => e.status === 'failure' || e.status === 'canceled')) return 'falhou'

  const deploy = estagios.find((e) => e.name === 'deploy')
  if (deploy?.status === 'success') return 'pronto'

  return 'andamento'
}

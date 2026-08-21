/**
 * O ambiente que toda Pages Function recebe: os bindings e variaveis
 * declarados no `wrangler.toml`.
 *
 * As fotos NAO passam por Function nenhuma — sao arquivos estaticos em
 * `/fotos/...` — entao nao ha binding de armazenamento para declarar.
 */
export type Env = {
  BANCO: D1Database

  /**
   * Dominio da equipe no Cloudflare Access, tipo `nomedaigreja.cloudflareaccess.com`.
   * Sai do painel do Access quando o Asafe cria a equipe. Enquanto nao existir,
   * `functions/api/admin/_middleware.ts` barra TODO acesso a `/api/admin/*` —
   * ver o comentario la para o porque disso ser proposital.
   */
  ACESSO_DOMINIO?: string

  /** O "Application Audience (AUD) Tag" da aplicacao Access criada para `/admin`. */
  ACESSO_AUD?: string
}

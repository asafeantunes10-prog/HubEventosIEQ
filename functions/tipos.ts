/**
 * O ambiente que toda Pages Function recebe: os bindings e variaveis
 * declarados no `wrangler.toml`, mais os secrets (esses NUNCA aparecem no
 * arquivo — sao configurados por `wrangler pages secret put` e vivem so na
 * Cloudflare).
 *
 * As fotos NAO passam por Function nenhuma — sao arquivos estaticos em
 * `/fotos/...` — entao nao ha binding de armazenamento para declarar.
 */
export type Env = {
  BANCO: D1Database

  /**
   * Hash PBKDF2 da senha do painel (`pbkdf2:<iteracoes>:<sal>:<hash>`),
   * gerado por `scripts/gerar-senha.mjs`. Secret, nunca var — nunca aparece
   * no `wrangler.toml` nem no git.
   */
  SENHA_HASH?: string

  /**
   * Chave usada para assinar (HMAC-SHA256) o cookie de sessao do painel.
   * Gerada junto com `SENHA_HASH` — ver `functions/lib/sessao.ts`.
   */
  SESSAO_SEGREDO?: string
}

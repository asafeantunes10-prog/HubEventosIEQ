/**
 * O ambiente que toda Pages Function recebe: os bindings e variaveis
 * declarados no `wrangler.toml`, mais os secrets (esses NUNCA aparecem no
 * arquivo — sao configurados por `wrangler pages secret put` e vivem so na
 * Cloudflare).
 *
 * As IMAGENS nao passam por Function nenhuma: moram num segundo projeto Pages,
 * so de arquivos estaticos (ver `functions/lib/paginasApi.ts`). Uma Function so
 * toca nelas para ATUALIZAR esse projeto pela API do Cloudflare, nunca para
 * servi-las.
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

  /**
   * Token da API do Cloudflare com a permissao "Cloudflare Pages: Editar".
   * E o que deixa o painel publicar fotos novas no projeto de fotos. Secret.
   * Sem ele (ou sem `CF_ACCOUNT_ID`) as rotas de `/api/admin/armazenamento/*`
   * respondem 503, como o login faz sem `SESSAO_SEGREDO`.
   */
  CF_API_TOKEN?: string

  /** Identificador da conta Cloudflare. Nao e segredo, mas fica junto do token. */
  CF_ACCOUNT_ID?: string

  /** So para testes locais: aponta a API do Pages para um servidor de mentira. Ver `paginasApi.ts`. */
  CF_API_BASE?: string
}

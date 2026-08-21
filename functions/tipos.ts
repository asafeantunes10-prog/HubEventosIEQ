/**
 * O ambiente que toda Pages Function recebe: os bindings declarados no
 * `wrangler.toml`.
 *
 * So o D1 aparece aqui. As fotos NAO passam por Function nenhuma — sao
 * arquivos estaticos em `/fotos/...` — entao nao ha binding de armazenamento
 * para declarar.
 */
export type Env = {
  BANCO: D1Database
}

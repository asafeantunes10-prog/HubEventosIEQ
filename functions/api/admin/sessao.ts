/**
 * GET /api/admin/sessao — o painel usa isto so para perguntar "estou logado?"
 *
 * Nao ha logica nenhuma aqui: o middleware (`_middleware.ts`) ja fez o
 * trabalho todo antes desta funcao rodar. Chegar ate aqui SIGNIFICA que a
 * sessao e valida — se nao fosse, o middleware ja teria devolvido 401 ou 503
 * e este codigo nunca executaria.
 */
export const onRequestGet: PagesFunction = async () => Response.json({ ok: true })

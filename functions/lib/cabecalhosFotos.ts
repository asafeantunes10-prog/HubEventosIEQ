/**
 * Os cabecalhos (`_headers`) do projeto de FOTOS.
 *
 * Fica num arquivo sem importacao nenhuma para poder ser lido tanto pelas
 * Functions (que o mandam em cada deploy, ver `paginasApi.ts`) quanto pelo
 * `scripts/migrar-fotos.mjs` (que o poe no primeiro deploy, feito pelo wrangler).
 * Os dois PRECISAM mandar o mesmo texto: um deploy sem CORS quebra o ZIP.
 *
 * `Access-Control-Allow-Origin: *` e o que deixa o site (outra origem) fazer
 * `fetch` das fotos para o ZIP e para o download avulso — `<img>` funciona sem
 * CORS, `fetch` nao. O cache de um ano e seguro porque o nome do arquivo carrega
 * um identificador sorteado que nunca se repete.
 */
export const CABECALHOS_FOTOS = `/fotos/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
`

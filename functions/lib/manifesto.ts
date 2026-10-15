/**
 * O manifesto do deploy do projeto de fotos, montado a partir de TEXTO.
 *
 * Fica num arquivo sem nenhuma importacao para poder ser testado no Node
 * (`npm test`) sem carregar o resto do servidor. A consulta que produz as linhas
 * esta em `publicacao.ts`; aqui so se junta o resultado.
 */

export type LinhaManifesto = {
  /** `"/fotos/slug/id-t.webp":"hash","/fotos/slug/id-g.webp":"hash",...` de UM evento. */
  entradas: string | null
  /** `"hash","hash",...` de UM evento. */
  hashes: string | null
  fotos: number
  /** Arquivos que o evento contribui: 2 por foto, ou 1 se arquivado. */
  arquivos: number
}

export type Manifesto = {
  /** `{"/fotos/...":"hash",...}` — o campo `manifest` do deployment. */
  manifesto: string
  /** `{"hashes":[...]}` — o corpo do `upsert-hashes`. */
  hashes: string
  arquivos: number
}

/**
 * Junta os textos de cada evento num JSON valido, sem nunca interpreta-los.
 *
 * Interpretar custaria o que uma Pages Function nao tem: ela tem 10 ms de CPU, e
 * 20.000 entradas viram objeto e voltam a texto em bem mais que isso.
 */
export function juntarManifesto(linhas: LinhaManifesto[]): Manifesto {
  const entradas = linhas.map((l) => l.entradas).filter((t): t is string => Boolean(t))
  const hashes = linhas.map((l) => l.hashes).filter((t): t is string => Boolean(t))

  return {
    manifesto: `{${entradas.join(',')}}`,
    hashes: `{"hashes":[${hashes.join(',')}]}`,
    arquivos: linhas.reduce((soma, l) => soma + (l.arquivos ?? 0), 0),
  }
}

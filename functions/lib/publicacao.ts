import { juntarManifesto, type LinhaManifesto, type Manifesto } from './manifesto'
import {
  buscarDeployment,
  situacaoDoDeploy,
  type EnvArmazenamento,
  type SituacaoDeploy,
} from './paginasApi'

/**
 * Estados de uma foto no campo `no_ar` (ver `migrations/0003_armazenamento.sql`).
 * Nomeados aqui para o SQL abaixo nao virar uma sopa de numeros.
 */
export const NO_AR = { pendente: 0, noAr: 1, emPublicacao: 2 } as const

/**
 * Monta, DENTRO DO SQL, os dois textos que o deploy precisa:
 *
 *   entradas  `"/fotos/slug/id-t.webp":"hash","/fotos/slug/id-g.webp":"hash",...`
 *   hashes    `"hash","hash",...`
 *
 * POR QUE NO SQL, E NAO EM JS
 * O manifesto de um site cheio tem 20.000 entradas. Montar isso como objeto e
 * serializar de volta custa bem mais que os 10 ms de CPU de uma Pages Function;
 * concatenar texto dentro do D1 nao custa nada aqui. Cada linha do resultado e UM
 * evento (centenas de KB, longe do teto de 2 MB por linha), e juntar os eventos
 * e so concatenar strings.
 *
 * Seguro contra injecao porque so entra no texto o que foi validado ao registrar
 * a foto: `caminho` e `<slug>/<12 hexa>` e os hashes sao 32 hexa.
 *
 * Evento arquivado so leva a miniatura (-t): a versao grande foi retirada de
 * proposito para liberar lugar no teto de 20.000 arquivos.
 */
const SQL_MANIFESTO = `
  select
    group_concat(
      '"/fotos/' || f.caminho || '-t.webp":"' || f.hash_t || '"' ||
      case when e.arquivado = 0
           then ',"/fotos/' || f.caminho || '-g.webp":"' || f.hash_g || '"'
           else '' end,
      ','
    ) as entradas,
    group_concat(
      '"' || f.hash_t || '"' ||
      case when e.arquivado = 0 then ',"' || f.hash_g || '"' else '' end,
      ','
    ) as hashes,
    count(*) as fotos,
    sum(case when e.arquivado = 0 then 2 else 1 end) as arquivos
  from fotos f
  join eventos e on e.id = f.evento_id
  where f.no_ar in (${NO_AR.noAr}, ${NO_AR.emPublicacao})
  group by f.evento_id`

export async function montarManifesto(banco: D1Database): Promise<Manifesto> {
  const { results } = await banco.prepare(SQL_MANIFESTO).all<LinhaManifesto>()
  return juntarManifesto(results)
}

/**
 * Quantas fotos esta no ar (ou em publicacao) sem o hash que o deploy exige.
 *
 * Um `||` com NULL vira NULL, e o `group_concat` PULA o NULL em silencio: uma
 * foto sem hash simplesmente sumiria do manifesto, e o deploy a apagaria do
 * site sem um unico erro. Contar antes e recusar e o que impede isso.
 */
export async function fotosSemHash(banco: D1Database): Promise<number> {
  const linha = await banco
    .prepare(
      `select count(*) as n
       from fotos f join eventos e on e.id = f.evento_id
       where f.no_ar in (${NO_AR.noAr}, ${NO_AR.emPublicacao})
         and (f.hash_t is null or (f.hash_g is null and e.arquivado = 0))`
    )
    .first<{ n: number }>()
  return linha?.n ?? 0
}

/**
 * Quantos arquivos o projeto de fotos tem — ou vai ter, se `incluirPendentes`.
 * E a conta que decide se cabe mais um lote nos 20.000.
 */
export async function contarArquivos(banco: D1Database, incluirPendentes: boolean): Promise<number> {
  const estados = incluirPendentes
    ? `${NO_AR.pendente}, ${NO_AR.noAr}, ${NO_AR.emPublicacao}`
    : `${NO_AR.noAr}, ${NO_AR.emPublicacao}`

  const linha = await banco
    .prepare(
      `select coalesce(sum(case when e.arquivado = 0 then 2 else 1 end), 0) as n
       from fotos f join eventos e on e.id = f.evento_id
       where f.no_ar in (${estados})`
    )
    .first<{ n: number }>()
  return linha?.n ?? 0
}

/** Desfaz a reserva das fotos que entraram num deploy que nao aconteceu. */
export async function devolverParaFila(banco: D1Database): Promise<void> {
  await banco
    .prepare(`update fotos set no_ar = ${NO_AR.pendente} where no_ar = ${NO_AR.emPublicacao}`)
    .run()
}

/**
 * Olha o deployment e acerta o banco conforme o resultado.
 *
 *   pronto  -> as fotos em publicacao passam a "no ar" e os totais sao
 *              recontados (cobre tambem as fotos apagadas desde o ultimo deploy)
 *   falhou  -> voltam para a fila
 *
 * E idempotente: chamar de novo depois de resolvido nao muda nada, o que deixa
 * o `publicar` (que espera um pouco) e o `estado` (que o navegador consulta
 * depois) usarem a mesma funcao.
 */
export async function reconciliar(
  env: EnvArmazenamento,
  deploymentId: string
): Promise<SituacaoDeploy> {
  const situacao = situacaoDoDeploy(await buscarDeployment(env, deploymentId))

  if (situacao === 'pronto') {
    await env.BANCO.batch([
      env.BANCO.prepare(`update fotos set no_ar = ${NO_AR.noAr} where no_ar = ${NO_AR.emPublicacao}`),
      env.BANCO.prepare(
        `update eventos set total_fotos =
           (select count(*) from fotos where evento_id = eventos.id and no_ar = ${NO_AR.noAr})`
      ),
    ])
  } else if (situacao === 'falhou') {
    await devolverParaFila(env.BANCO)
  }

  return situacao
}

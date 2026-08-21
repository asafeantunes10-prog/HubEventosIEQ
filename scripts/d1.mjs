/**
 * Conversa com o D1 a partir de um script do PC.
 *
 * POR QUE PELO WRANGLER, E NAO PELA API HTTP
 * A API REST do D1 exigiria um API Token guardado em algum lugar — mais um
 * segredo para criar, girar e vazar. O `wrangler` ja esta autenticado pelo
 * `wrangler login` (OAuth, sem segredo em arquivo), entao chamar o binario
 * custa alguns segundos por lote e nao deixa nenhuma credencial no projeto.
 *
 * POR QUE SEMPRE POR ARQUIVO, E NUNCA POR `--command`
 * O SQL vai para um arquivo temporario e o wrangler le de la. Passar SQL na
 * linha de comando no Windows e uma fonte inesgotavel de dor: aspas simples,
 * acentos, quebras de linha e o limite de ~8 KB do `cmd` — e o LQIP de uma foto
 * sozinho ja tem ~400 bytes de base64. Por arquivo nada disso existe.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Precisa bater com `database_name` no `wrangler.toml`. */
const BANCO = 'hub-eventos-ieq'

/**
 * Quantos comandos por arquivo. O D1 tem teto de tamanho por requisicao, e um
 * INSERT com LQIP passa de 400 bytes — 25 por vez deixa folga larga e ainda
 * mantem o numero de chamadas ao wrangler baixo (500 fotos = 20 lotes).
 */
export const TAMANHO_LOTE = 25

/**
 * Escapa um valor para dentro do SQL.
 *
 * Duplicar a aspa simples e o escape do proprio SQLite: `d'agua` vira
 * `'d''agua'`. Sem isto, um nome de arquivo com apostrofo — coisa comum em
 * "Culto de Jovens - Pr's" — encerraria a string no meio e o INSERT viraria
 * sintaxe invalida, ou pior, algo que executa.
 */
export function aspas(valor) {
  if (valor === null || valor === undefined) return 'null'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'boolean') return valor ? '1' : '0'
  return `'${String(valor).replace(/'/g, "''")}'`
}

/*
  Chama o `wrangler.js` com o proprio Node, em vez de passar por `npx`.

  `npx` no Windows e um arquivo `.cmd`, e executa-lo exigiria `shell: true` —
  que concatena os argumentos numa string em vez de escapa-los, e o Node avisa
  disso (DEP0190) justamente porque um caminho com espaco ou aspa vira injecao
  de comando. Aqui os caminhos vem de `tmpdir()`, que no Windows quase sempre
  tem espaco. Sem shell, cada argumento chega inteiro e literal.
*/
const WRANGLER = resolve(import.meta.dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function rodarWrangler(args) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })

  if (r.error) throw new Error(`Nao consegui chamar o wrangler: ${r.error.message}`)

  if (r.status !== 0) {
    const detalhe = (r.stderr || r.stdout || '').trim().split('\n').slice(-12).join('\n')
    throw new Error(`O wrangler falhou:\n${detalhe}`)
  }

  return r.stdout ?? ''
}

/** Roda o SQL num arquivo temporario que e apagado mesmo se der erro. */
function comArquivoSql(sql, usar) {
  const pasta = mkdtempSync(join(tmpdir(), 'hub-d1-'))
  const arquivo = join(pasta, 'lote.sql')

  try {
    writeFileSync(arquivo, sql, 'utf8')
    return usar(arquivo)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

/** Executa SQL que nao devolve linhas (INSERT, UPDATE, DELETE). */
export function executar(sql, { local = false } = {}) {
  comArquivoSql(sql, (arquivo) =>
    rodarWrangler([
      'd1',
      'execute',
      BANCO,
      local ? '--local' : '--remote',
      `--file=${arquivo}`,
      '--yes',
    ])
  )
}

/**
 * Executa SQL e devolve as linhas.
 *
 * POR QUE CONSULTA VAI POR `--command` E NAO POR `--file`
 * Contra o banco REMOTO, o wrangler trata um arquivo como importacao em lote e
 * devolve um RESUMO no lugar das linhas — um unico objeto com "Total queries
 * executed", "Rows read" e afins, dentro do mesmo campo `results`. Quem esperava
 * as linhas recebe um objeto com forma de linha e campos completamente outros,
 * e o erro so aparece muito depois, como um NULL num INSERT seguinte. Com
 * `--command` as linhas vem de verdade, nos dois modos.
 *
 * Isso vale porque as consultas daqui sao curtas e de forma conhecida. O que e
 * volumoso — os INSERTs com LQIP — continua indo por arquivo, em `executar()`.
 * O `spawnSync` nao usa shell, entao o SQL chega ao wrangler como um argumento
 * unico e literal, sem interferencia de aspas do `cmd`.
 *
 * O `--json` ainda imprime o cabecalho da ferramenta antes do JSON, entao o
 * parse comeca na primeira linha que e um `[` sozinho.
 */
export function consultar(sql, { local = false } = {}) {
  const saida = rodarWrangler([
    'd1',
    'execute',
    BANCO,
    local ? '--local' : '--remote',
    '--command',
    sql,
    '--json',
    '--yes',
  ])

  const ancora = saida.match(/^\[\s*$/m)
  const inicio = ancora ? ancora.index : saida.indexOf('[')

  if (inicio === -1) {
    throw new Error(`Resposta do D1 sem JSON:\n${saida.trim().slice(-500)}`)
  }

  let blocos
  try {
    blocos = JSON.parse(saida.slice(inicio))
  } catch (e) {
    throw new Error(`Nao entendi a resposta do D1: ${e.message}`)
  }

  const linhas = blocos.at(-1)?.results ?? []

  /*
    Rede de seguranca contra o resumo descrito acima. Se um dia o wrangler
    devolver estatisticas onde deviam vir linhas, e melhor parar aqui com o
    motivo escrito do que deixar um objeto de forma errada seguir adiante e
    reaparecer como NULL numa chave estrangeira, tres passos depois.
  */
  if (linhas.length > 0 && 'Total queries executed' in linhas[0]) {
    throw new Error(
      'O D1 devolveu um resumo em vez das linhas da consulta. ' +
        'Consulta precisa ir por --command, nao por --file.'
    )
  }

  return linhas
}

/** Quebra uma lista de comandos em arquivos que o D1 aguenta de uma vez. */
export function executarEmLotes(comandos, { local = false, aoProgredir } = {}) {
  for (let i = 0; i < comandos.length; i += TAMANHO_LOTE) {
    const lote = comandos.slice(i, i + TAMANHO_LOTE)
    executar(lote.join('\n'), { local })
    aoProgredir?.(Math.min(i + lote.length, comandos.length), comandos.length)
  }
}

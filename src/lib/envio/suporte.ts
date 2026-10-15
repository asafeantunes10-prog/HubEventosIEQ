/**
 * Este navegador consegue preparar fotos?
 *
 * O envio depende de quatro coisas modernas: Web Workers (para a tela nao
 * travar), `OffscreenCanvas` (para reduzir a foto dentro do worker),
 * `createImageBitmap` (para decodificar) e WebAssembly (o codificador de WebP e o
 * leitor de RAW). Chrome, Edge e Firefox recentes tem todas; o Safari as tem a
 * partir da versao 16.4.
 *
 * Perguntar ANTES evita um erro tecnico por foto ("Can't find variable:
 * OffscreenCanvas") e dispensa a pessoa de adivinhar o que fazer: a tela diz o
 * que usar.
 */
export function faltaParaEnviar(): string[] {
  const falta: string[] = []
  if (typeof Worker === 'undefined') falta.push('Web Workers')
  if (typeof OffscreenCanvas === 'undefined') falta.push('OffscreenCanvas')
  if (typeof createImageBitmap === 'undefined') falta.push('createImageBitmap')
  if (typeof WebAssembly === 'undefined') falta.push('WebAssembly')
  return falta
}

export const MENSAGEM_NAVEGADOR_ANTIGO =
  'Este navegador é antigo demais para preparar as fotos. Use a versão atual do Chrome, Edge, ' +
  'Firefox ou Safari (16.4 ou mais novo).'

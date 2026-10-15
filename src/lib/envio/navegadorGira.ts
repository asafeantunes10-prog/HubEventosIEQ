/**
 * Este navegador gira sozinho um JPEG que tem orientacao EXIF?
 *
 * POR QUE PERGUNTAR EM VEZ DE SUPOR
 * Na especificacao, `createImageBitmap` gira a imagem pelo EXIF por padrao, e
 * a opcao `imageOrientation: 'none'` existia para desligar isso. Na pratica o
 * Chrome atual IGNORA a opcao e gira sempre (medido: um JPEG 3000x2000 com
 * orientacao 6 sai 2000x3000 com 'none', 'from-image' ou sem opcao nenhuma).
 * Outros navegadores e versoes antigas se comportam de outro jeito. Girar por
 * conta propria uma imagem que o navegador JA girou a deixa de cabeca para
 * baixo ou de lado — foi exatamente o bug que o primeiro teste pegou.
 *
 * Entao o teste e feito uma vez, com uma imagem de 2x1 pixels que tem
 * orientacao 6 (girar 90 graus): se o navegador entrega 1x2, ele gira sozinho;
 * se entrega 2x1, nao.
 */

/** JPEG 2x1 com a tag EXIF Orientation = 6, sem perfil de cor (484 bytes). */
const JPEG_ORIENTACAO_6 =
  '/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAIAAAADoAQAAQAAAAEAAAAAAAAA/9sAQwANCQoLCggNCwoLDg4NDxMgFRMSEhMnHB4XIC4pMTAuKS0sMzpKPjM2RjcsLUBXQUZMTlJTUjI+WmFaUGBKUVJP/9sAQwEODg4TERMmFRUmTzUtNU9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09P/8AAEQgAAQACAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAG/8QAGRABAAIDAAAAAAAAAAAAAAAAAAEDNHKx/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAbEQAABwEAAAAAAAAAAAAAAAAAAQIDM3GxBP/aAAwDAQACEQMRAD8Ahr8izaegKHzwoosAPyqs9H//2Q=='

let resposta: Promise<boolean> | null = null

export function navegadorGiraSozinho(): Promise<boolean> {
  resposta ??= (async () => {
    try {
      const bytes = Uint8Array.from(atob(JPEG_ORIENTACAO_6), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
      const girou = bitmap.width === 1 && bitmap.height === 2
      bitmap.close()
      return girou
    } catch {
      // Sem como testar, o mais comum hoje (Chrome, Edge, Firefox recente) e girar.
      return true
    }
  })()
  return resposta
}

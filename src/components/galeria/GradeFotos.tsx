import { CartaoFoto } from '@/components/galeria/CartaoFoto'
import { cn } from '@/lib/utils'
import type { Foto, LayoutEvento } from '@/lib/tipos'

type Props = {
  fotos: Foto[]
  layout: LayoutEvento
  aoAbrir: (indice: number) => void
  aoBaixar: (foto: Foto, indice: number) => void
}

/**
 * Grade em mosaico (masonry): colunas de largura fixa, fotos de alturas
 * diferentes se encaixando sem cortes.
 *
 * POR QUE `columns` DO CSS, E NAO GRID NEM UMA BIBLIOTECA
 * O masonry de verdade (`grid-template-rows: masonry`) ainda nao existe fora de
 * bandeira experimental. As bibliotecas de JavaScript resolvem medindo cada
 * foto e posicionando em absoluto — o que significa recalcular tudo a cada
 * redimensionamento, e um salto visivel enquanto as imagens carregam.
 *
 * `columns` e nativo, custa zero JavaScript e distribui sozinho. O preco e a
 * ordem: as fotos preenchem uma coluna de cima a baixo antes de passar para a
 * proxima, entao a leitura e vertical, nao em linhas. Numa galeria de evento
 * isso nao atrapalha — ninguem le um culto da esquerda para a direita — e a
 * numeracao de cada foto continua correta porque vem do indice no array.
 *
 * `break-inside-avoid` em cada cartao (ver `CartaoFoto`) e o que impede uma
 * foto de ser partida ao meio entre duas colunas.
 *
 * O layout `uniforme` e a alternativa por evento: grade quadrada, todas as
 * fotos do mesmo tamanho. Serve para eventos de fotos muito parecidas, onde o
 * mosaico so parece bagunca.
 */
export function GradeFotos({ fotos, layout, aoAbrir, aoBaixar }: Props) {
  if (fotos.length === 0) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        As fotos ainda não foram enviadas. Volte em breve.
      </p>
    )
  }

  return (
    <div
      className={cn(
        layout === 'mosaico'
          ? 'columns-2 gap-3 sm:gap-4 md:columns-3 xl:columns-4'
          : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4'
      )}
    >
      {fotos.map((foto, indice) => (
        <CartaoFoto
          key={foto.id}
          foto={foto}
          indice={indice}
          aoAbrir={aoAbrir}
          aoBaixar={aoBaixar}
        />
      ))}
    </div>
  )
}

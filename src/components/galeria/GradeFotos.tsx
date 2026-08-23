import * as React from 'react'

import { CartaoFoto } from '@/components/galeria/CartaoFoto'
import { cn } from '@/lib/utils'
import type { Foto, LayoutEvento } from '@/lib/tipos'

type Props = {
  fotos: Foto[]
  layout: LayoutEvento
  /** `false` num evento arquivado — a versao -g nao existe mais, entao nao ha o que baixar. */
  temVersaoGrande: boolean
  aoAbrir: (indice: number) => void
  aoBaixar: (foto: Foto, indice: number) => void
}

/** Quantos cartoes existem no DOM de uma vez. Ver o comentario acima do IntersectionObserver. */
const PASSO = 60

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
 *
 * POR QUE SO UM PEDACO DAS FOTOS ENTRA NO DOM DE CADA VEZ
 * A primeira tentativa de acelerar um evento de 500+ fotos foi
 * `content-visibility: auto` em cada cartao — pular layout/pintura de quem
 * esta fora da tela. Na pratica, deu um glitch pior que o problema: dentro de
 * `columns`, o navegador BALANCEIA a altura das colunas o tempo todo, e um
 * cartao trocando de "ocultado" pra "tamanho real" no meio do scroll faz
 * VARIOS cartoes ja vistos pularem de posicao — nao so o de baixo. A correcao
 * daqui e diferente: os cartoes fora da tela simplesmente NAO EXISTEM no DOM
 * ainda (em vez de existir e o navegador fingir que nao). Um `IntersectionObserver`
 * observa uma sentinela no fim da lista renderizada e libera mais `PASSO`
 * cartoes quando ela se aproxima da tela. Cartao que ja apareceu nunca muda de
 * tamanho depois — so cresce o fim da lista, entao nao ha o que rebalancear
 * pra tras.
 */
export function GradeFotos({ fotos, layout, temVersaoGrande, aoAbrir, aoBaixar }: Props) {
  const [quantidade, setQuantidade] = React.useState(() => Math.min(PASSO, fotos.length))
  const sentinelaRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (quantidade >= fotos.length) return
    const sentinela = sentinelaRef.current
    if (!sentinela) return

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setQuantidade((atual) => Math.min(atual + PASSO, fotos.length))
        }
      },
      // Comeca a liberar o proximo lote bem antes da sentinela aparecer de
      // verdade, pra pessoa rolando rapido nunca ver o fim da lista vazio.
      { rootMargin: '1200px' }
    )

    observador.observe(sentinela)
    return () => observador.disconnect()
  }, [quantidade, fotos.length])

  if (fotos.length === 0) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        As fotos ainda não foram enviadas. Volte em breve.
      </p>
    )
  }

  const visiveis = fotos.slice(0, quantidade)

  return (
    <>
      <div
        className={cn(
          layout === 'mosaico'
            ? 'columns-2 gap-3 sm:gap-4 md:columns-3 xl:columns-4'
            : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4'
        )}
      >
        {visiveis.map((foto, indice) => (
          <CartaoFoto
            key={foto.id}
            foto={foto}
            indice={indice}
            temVersaoGrande={temVersaoGrande}
            aoAbrir={aoAbrir}
            aoBaixar={aoBaixar}
          />
        ))}
      </div>

      {/* So existe enquanto sobrar foto pra liberar — depois que tudo esta no DOM, some. */}
      {quantidade < fotos.length && <div ref={sentinelaRef} aria-hidden className="h-px" />}
    </>
  )
}

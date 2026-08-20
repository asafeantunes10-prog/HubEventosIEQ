import * as React from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'

import { urlFoto } from '@/lib/urls'
import type { Foto } from '@/lib/tipos'

type Props = {
  fotos: Foto[]
  indice: number
  aoFechar: () => void
  aoNavegar: (indice: number) => void
  aoBaixar: (foto: Foto, indice: number) => void
}

/** Distancia minima, em pixels, para um arrasto contar como troca de foto. */
const LIMIAR_ARRASTO = 50

/**
 * Foto em tela cheia, com navegacao por teclado, seta e arrasto.
 *
 * Escrito na mao em vez de usar o `<Dialog>` do Radix que ja existe no projeto:
 * aquele componente centraliza um painel com largura maxima, prende o scroll e
 * anima entrada e saida — tudo trabalho desperdicado para uma imagem que ocupa
 * a tela inteira, e que precisa justamente do contrario (nenhuma margem,
 * nenhuma caixa). O que importava dele — foco preso, Escape, fundo travado —
 * sao as tres coisas implementadas abaixo.
 *
 * Aqui a foto exibida e a versao MEDIA (1080px), nao a grande: em tela cheia de
 * celular ela e indistinguivel da de 2048px e pesa um terco. A grande fica para
 * o download, que e quando o tamanho realmente importa.
 */
export function Visualizador({ fotos, indice, aoFechar, aoNavegar, aoBaixar }: Props) {
  const foto = fotos[indice]
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inicioToque = React.useRef<{ x: number; y: number } | null>(null)

  const anterior = React.useCallback(() => {
    // Circular: da ultima volta para a primeira. Numa galeria, chegar ao fim e
    // topar com um botao morto e pior que continuar rolando.
    aoNavegar((indice - 1 + fotos.length) % fotos.length)
  }, [indice, fotos.length, aoNavegar])

  const proxima = React.useCallback(() => {
    aoNavegar((indice + 1) % fotos.length)
  }, [indice, fotos.length, aoNavegar])

  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowLeft') anterior()
      if (e.key === 'ArrowRight') proxima()
    }

    window.addEventListener('keydown', aoTeclar)

    /*
      Trava a rolagem do fundo. Sem isto, rolar a foto no celular arrasta a
      GRADE atras dela: ao fechar o visualizador a pessoa esta a centenas de
      fotos de onde estava.

      Guarda e restaura o valor anterior em vez de zerar para `''`: outra parte
      do site pode ter travado a rolagem por sua conta (um menu aberto), e
      limpar cegamente destravaria o que nao e nosso.
    */
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    containerRef.current?.focus()

    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aoFechar, anterior, proxima])

  /*
    Pre-carrega a foto seguinte e a anterior. E o que faz a navegacao parecer
    instantanea: quando a pessoa aperta a seta, a imagem ja esta no cache do
    navegador. Custa dois downloads que quase sempre serao usados.
  */
  React.useEffect(() => {
    for (const vizinho of [
      (indice + 1) % fotos.length,
      (indice - 1 + fotos.length) % fotos.length,
    ]) {
      const alvo = fotos[vizinho]
      if (alvo) {
        const img = new Image()
        img.src = urlFoto(alvo, 'm')
      }
    }
  }, [indice, fotos])

  if (!foto) return null

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${indice + 1} de ${fotos.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm focus:outline-none"
      onTouchStart={(e) => {
        inicioToque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        const inicio = inicioToque.current
        if (!inicio) return
        inicioToque.current = null

        const dx = e.changedTouches[0].clientX - inicio.x
        const dy = e.changedTouches[0].clientY - inicio.y

        // Só conta como troca de foto se o gesto foi mais horizontal que
        // vertical. Sem essa comparacao, o arrasto para fechar (vertical) e
        // qualquer rolagem hesitante virariam navegacao acidental.
        if (Math.abs(dx) > LIMIAR_ARRASTO && Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) anterior()
          else proxima()
        }
      }}
    >
      <header className="flex items-center justify-between gap-4 px-4 py-3 text-white/70">
        <span className="text-sm tabular-nums">
          {indice + 1} / {fotos.length}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => aoBaixar(foto, indice)}
            aria-label="Baixar esta foto"
            className="flex size-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          >
            <Download className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="flex size-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Clicar no vazio em volta da foto fecha — atalho que todo mundo tenta.
          O clique na propria imagem NAO fecha (`stopPropagation` abaixo): a
          pessoa quer olhar a foto de perto sem o visualizador sumir. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2"
        onClick={aoFechar}
      >
        <img
          key={foto.id}
          src={urlFoto(foto, 'm')}
          alt={`Foto ${indice + 1}`}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />

        {fotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                anterior()
              }}
              aria-label="Foto anterior"
              className="absolute left-2 flex size-12 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/70 md:left-6"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                proxima()
              }}
              aria-label="Próxima foto"
              className="absolute right-2 flex size-12 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/70 md:right-6"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

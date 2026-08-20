import * as React from 'react'
import { Download, ImageOff, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { urlFoto } from '@/lib/fotos'
import type { Foto } from '@/lib/tipos'

type Props = {
  foto: Foto
  indice: number
  aoAbrir: (indice: number) => void
  aoBaixar: (foto: Foto, indice: number) => void
}

export function CartaoFoto({ foto, indice, aoAbrir, aoBaixar }: Props) {
  const [carregou, setCarregou] = React.useState(false)
  const [falhou, setFalhou] = React.useState(false)

  /*
    Proporcao real da foto, gravada no banco no momento do envio. Reservar a
    altura ANTES de a imagem chegar e o que impede a grade de dar solavancos
    enquanto carrega — numa coluna de 500 fotos, sem isto, o que a pessoa esta
    olhando pula para fora da tela toda vez que uma imagem acima dela termina.

    O 2/3 de reserva e o retrato tipico; so vale para fotos sem dimensoes
    gravadas.
  */
  const proporcao = foto.largura && foto.altura ? foto.largura / foto.altura : 2 / 3

  return (
    <figure className="group relative mb-3 break-inside-avoid sm:mb-4">
      <button
        type="button"
        onClick={() => aoAbrir(indice)}
        className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-superficie/50 focus:ring-2 focus:ring-primary/50 focus:outline-none"
        style={{
          aspectRatio: String(proporcao),
          /*
            O LQIP vem embutido no JSON da lista, entao pintar o borrado nao
            custa nenhuma requisicao a mais — e o que a pessoa ve enquanto a
            miniatura de verdade nao chegou.
          */
          ...(foto.lqip
            ? {
                backgroundImage: `url("${foto.lqip}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : null),
        }}
        aria-label={`Abrir foto ${indice + 1}`}
      >
        {!carregou && !falhou && !foto.lqip && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/40" aria-hidden />
          </span>
        )}

        {falhou ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
            <ImageOff className="size-6" aria-hidden />
            <span className="text-xs">Não carregou</span>
          </span>
        ) : (
          <img
            src={urlFoto(foto.caminho, 't')}
            alt={`Foto ${indice + 1}`}
            /*
              `lazy` + `async`: numa galeria de 500 fotos, o navegador so baixa
              o que esta perto da tela. Sem isto a pessoa esperaria 500
              downloads antes de ver a primeira foto.
            */
            loading="lazy"
            decoding="async"
            onLoad={() => setCarregou(true)}
            onError={() => setFalhou(true)}
            className={cn(
              'size-full object-cover transition-all duration-700',
              'group-hover:scale-[1.03]',
              carregou ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}

        {/* Escurece o pe da foto para o botao branco ter contraste sobre
            qualquer imagem — inclusive um ceu claro ou uma parede branca. */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />
      </button>

      <button
        type="button"
        onClick={() => aoBaixar(foto, indice)}
        aria-label={`Baixar foto ${indice + 1}`}
        className={cn(
          'absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full',
          'bg-black/45 text-white backdrop-blur-sm transition-all duration-300 hover:bg-black/65',
          // No celular nao ha hover: o botao precisa estar sempre visivel, ou
          // ninguem descobre que da para baixar foto a foto. No desktop ele
          // aparece ao passar o mouse, deixando a foto limpa.
          'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
        )}
      >
        <Download className="size-4" aria-hidden />
      </button>
    </figure>
  )
}

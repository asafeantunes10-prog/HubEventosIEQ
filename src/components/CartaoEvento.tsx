import { Link } from 'react-router'
import { ImageIcon } from 'lucide-react'

import { Imagem } from '@/components/Imagem'
import { urlFoto } from '@/lib/fotos'
import { cn, formatarData } from '@/lib/utils'
import type { EventoComCapa } from '@/lib/tipos'

type Props = { evento: EventoComCapa }

/**
 * Um evento anterior na lista da home.
 *
 * No celular e um cartao quadrado numa grade de duas colunas (a capa em cima,
 * o nome embaixo); no computador vira uma linha larga, com a foto a esquerda e
 * o nome grande a direita.
 *
 * A capa usa a miniatura `t` (400px) no celular — num cartao de 180px a versao
 * grande seria banda jogada fora — e a versao grande `g` no computador, onde a
 * foto ocupa uns 500px e a miniatura ficaria borrada. Evento arquivado so tem a
 * `t`. Sem capa (evento publicado antes da primeira foto subir), cai num icone:
 * melhor que puxar `urlFoto()` para um caminho vazio e deixar o navegador tentar
 * um `GET` que sempre vai dar 404.
 */
export function CartaoEvento({ evento }: Props) {
  const capa = evento.capa

  return (
    <Link
      to={`/e/${evento.slug}`}
      className="group flex flex-col gap-2.5 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring md:grid md:grid-cols-[5fr_7fr] md:items-center md:gap-14 md:rounded-none md:py-9"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted md:aspect-[16/10] md:rounded-[14px]">
        {capa ? (
          <Imagem
            src={urlFoto(capa.caminho, 't')}
            fontes={
              evento.arquivado
                ? undefined
                : [{ media: '(min-width: 768px)', srcSet: urlFoto(capa.caminho, 'g') }]
            }
            alt=""
            lqip={capa.lqip ?? undefined}
            largura={capa.largura ?? undefined}
            altura={capa.altura ?? undefined}
            className="size-full transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden />
          </div>
        )}

        {evento.destaque && (
          <span className="absolute top-2 left-2 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            Destaque
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 md:gap-3.5">
        <h3 className="line-clamp-2 font-heading text-[19px] leading-[1.15] md:line-clamp-none md:text-[54px] md:leading-[1.05]">
          {evento.titulo}
        </h3>

        {evento.dataEvento && (
          <p className="text-[15px] text-muted-foreground md:text-[19px] md:text-foreground/90">
            {formatarData(evento.dataEvento)}
          </p>
        )}

        <p className="text-[15px] text-muted-foreground md:text-[19px] md:text-foreground">
          {evento.totalFotos} {evento.totalFotos === 1 ? 'foto' : 'fotos'}
        </p>

        {/* So no computador: no celular o cartao inteiro ja e o alvo do toque. */}
        <span
          className={cn(
            'hidden text-lg font-semibold text-destaque underline underline-offset-[5px] md:inline',
            'group-hover:text-foreground'
          )}
          aria-hidden
        >
          Ver as fotos
        </span>
      </div>
    </Link>
  )
}

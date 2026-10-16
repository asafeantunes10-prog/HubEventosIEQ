import { Link } from 'react-router'
import { ChevronRight, ImageIcon } from 'lucide-react'

import { Imagem } from '@/components/Imagem'
import { urlFoto } from '@/lib/fotos'
import { formatarData } from '@/lib/utils'
import type { EventoComCapa } from '@/lib/tipos'

type Props = { evento: EventoComCapa }

/**
 * Um evento anterior na lista da home: um cartao com borda, a capa em cima e o
 * nome, a data e a quantidade embaixo.
 *
 * O cartao (e nao so a foto solta) e o que separa um evento do vizinho: sem a
 * borda, numa grade de duas colunas no celular, o titulo de um evento ficava
 * a mesma distancia da foto de cima e da foto de baixo, e nao dava para dizer
 * a qual das duas ele pertencia.
 *
 * A capa usa a miniatura `t` (400px) no celular — num cartao de 180px a versao
 * grande seria banda jogada fora — e a versao grande `g` no computador, onde a
 * foto ocupa uns 400px e a miniatura ficaria borrada. Evento arquivado so tem a
 * `t`. Sem capa (evento publicado antes da primeira foto subir), cai num icone:
 * melhor que puxar `urlFoto()` para um caminho vazio e deixar o navegador tentar
 * um `GET` que sempre vai dar 404.
 */
export function CartaoEvento({ evento }: Props) {
  const capa = evento.capa

  return (
    <Link
      to={`/e/${evento.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-2 pb-4 outline-none transition-colors hover:bg-white/[0.11] focus-visible:ring-4 focus-visible:ring-ring md:gap-4 md:p-3 md:pb-5"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted md:aspect-[16/10]">
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

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1.5 md:gap-1.5 md:px-2">
        <h3 className="line-clamp-2 font-heading text-[19px] leading-[1.15] md:text-[26px] md:leading-[1.1]">
          {evento.titulo}
        </h3>

        {evento.dataEvento && (
          <p className="text-[15px] text-muted-foreground md:text-[17px]">
            {formatarData(evento.dataEvento)}
          </p>
        )}

        <p className="text-[15px] text-foreground/90 md:text-[17px]">
          {evento.totalFotos} {evento.totalFotos === 1 ? 'foto' : 'fotos'}
        </p>

        {/* So no computador: no celular o cartao inteiro ja e o alvo do toque. */}
        <span
          className="mt-auto hidden items-center gap-1 pt-3 text-base font-semibold text-destaque group-hover:text-foreground md:inline-flex"
          aria-hidden
        >
          Ver as fotos
          <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  )
}

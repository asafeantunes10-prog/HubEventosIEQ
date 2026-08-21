import { Link } from 'react-router'
import { ImageIcon } from 'lucide-react'

import { Imagem } from '@/components/Imagem'
import { urlFoto } from '@/lib/fotos'
import { cn, formatarData } from '@/lib/utils'
import type { EventoComCapa } from '@/lib/tipos'

type Props = { evento: EventoComCapa }

/**
 * O cartao de evento na grade da home.
 *
 * A capa usa a mesma versao `t` (400px) da grade de fotos — e so uma miniatura
 * num cartao pequeno, entao a versao grande seria banda jogada fora. Sem capa
 * (evento publicado antes da primeira foto subir), cai num icone: melhor que
 * puxar `urlFoto()` para um caminho vazio e deixar o navegador tentar um `GET`
 * que sempre vai dar 404.
 */
export function CartaoEvento({ evento }: Props) {
  return (
    <Link
      to={`/e/${evento.slug}`}
      className="group focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:outline-none rounded-xl"
    >
      <article className="superficie-identidade overflow-hidden rounded-xl transition-transform duration-300 group-hover:-translate-y-0.5">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {evento.capa ? (
            <Imagem
              src={urlFoto(evento.capa.caminho, 't')}
              alt=""
              lqip={evento.capa.lqip ?? undefined}
              largura={evento.capa.largura ?? undefined}
              altura={evento.capa.altura ?? undefined}
              className="size-full transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden />
            </div>
          )}

          {evento.destaque && (
            <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 text-[0.65rem] font-medium tracking-wide text-primary-foreground uppercase">
              Destaque
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 p-4">
          <h2 className="font-heading truncate text-lg leading-snug text-champanhe-claro">
            {evento.titulo}
          </h2>

          <p className={cn('text-sm text-muted-foreground', !evento.dataEvento && 'invisible')}>
            {evento.dataEvento ? formatarData(evento.dataEvento) : '—'}
          </p>

          <p className="mt-1 text-xs text-muted-foreground/70">
            {evento.totalFotos} {evento.totalFotos === 1 ? 'foto' : 'fotos'}
          </p>
        </div>
      </article>
    </Link>
  )
}

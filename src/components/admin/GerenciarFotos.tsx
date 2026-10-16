import * as React from 'react'
import { ChevronDown, ChevronUp, Clock, ImageOff, Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { urlFoto } from '@/lib/fotos'
import type { FotoAdmin } from '@/lib/apiAdmin'

type Props = {
  /** Ja na ordem correta — quem chama e responsavel por manter isso. */
  fotos: FotoAdmin[]
  capaId: string | null
  aoMoverFoto: (indice: number, direcao: -1 | 1) => void
  aoDefinirCapa: (fotoId: string) => void
  aoApagarFoto: (fotoId: string) => void
}

/**
 * Grade de gerenciamento das fotos do evento: reordenar, escolher a capa e
 * apagar. O envio de fotos novas fica em `EnviarFotos.tsx`.
 *
 * Uma foto recem-enviada ainda nao esta no ar (o deploy leva alguns segundos):
 * aparece aqui como "aguardando", sem tentar carregar uma imagem que ainda nao
 * existe.
 *
 * Reordenar e por BOTAO (subir/descer), nao arrastar. Drag-and-drop e
 * notoriamente ruim no toque de celular — e e justamente de celular que o
 * plano pede para o painel funcionar — e os botoes chegam ao mesmo resultado
 * sem precisar de uma biblioteca de gestos.
 */
export function GerenciarFotos({ fotos, capaId, aoMoverFoto, aoDefinirCapa, aoApagarFoto }: Props) {
  if (fotos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhuma foto ainda. Use o envio acima para adicionar.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {fotos.map((foto, indice) => (
        <li key={foto.id} className="flex flex-col gap-1.5">
          <MiniaturaFoto foto={foto} ehCapa={foto.id === capaId} />

          <div className="flex items-center justify-between gap-1">
            <div className="flex gap-0.5">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => aoMoverFoto(indice, -1)}
                disabled={indice === 0}
                aria-label={`Mover foto ${indice + 1} para cima`}
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => aoMoverFoto(indice, 1)}
                disabled={indice === fotos.length - 1}
                aria-label={`Mover foto ${indice + 1} para baixo`}
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </Button>
            </div>

            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                size="xs"
                variant={foto.id === capaId ? 'secondary' : 'ghost'}
                onClick={() => aoDefinirCapa(foto.id)}
                // Uma foto que ainda nao esta no ar nao pode ser capa: a home
                // mostraria imagem quebrada ate o deploy terminar.
                disabled={foto.id === capaId || foto.situacao !== 'no-ar'}
              >
                {foto.id === capaId ? 'É a capa' : 'Definir capa'}
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => aoApagarFoto(foto.id)}
                aria-label={`Apagar a foto ${indice + 1}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function MiniaturaFoto({ foto, ehCapa }: { foto: FotoAdmin; ehCapa: boolean }) {
  const [falhou, setFalhou] = React.useState(false)

  return (
    <div
      className={cn(
        'relative aspect-square overflow-hidden rounded-lg bg-muted ring-2 ring-transparent',
        ehCapa && 'ring-destaque'
      )}
    >
      {foto.situacao !== 'no-ar' ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <Clock className="size-5" aria-hidden />
          <span className="text-[0.65rem]">Aguardando publicação</span>
        </span>
      ) : falhou ? (
        <span className="flex size-full items-center justify-center">
          <ImageOff className="size-5 text-muted-foreground/40" aria-hidden />
        </span>
      ) : (
        <img
          src={urlFoto(foto.caminho, 't')}
          alt=""
          loading="lazy"
          onError={() => setFalhou(true)}
          className="size-full object-cover"
        />
      )}

      {ehCapa && (
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
          <Star className="size-2.5 fill-current" aria-hidden />
          Capa
        </span>
      )}
    </div>
  )
}

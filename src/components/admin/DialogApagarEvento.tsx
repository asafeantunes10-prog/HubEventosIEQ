import * as React from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type Props = {
  titulo: string
  totalFotos: number
  aoConfirmar: () => void
  /** `icon` para a linha da lista; `default` para o botao de "zona de perigo" na edicao. */
  variante?: 'icon' | 'botao'
}

/**
 * A confirmacao de "apagar evento", reusada na lista e na tela de edicao.
 *
 * O texto e o ponto mais importante deste componente, nao o botao: apagar um
 * evento tira a pagina E as fotos do ar, e nao tem volta pelo painel. As
 * fotos originais da equipe (RAW/JPEG) nao sao tocadas — so as versoes que o
 * site guardava.
 */
export function DialogApagarEvento({ titulo, totalFotos, aoConfirmar, variante = 'icon' }: Props) {
  const [aberto, setAberto] = React.useState(false)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {variante === 'icon' ? (
          <Button size="icon-sm" variant="ghost" aria-label={`Apagar ${titulo}`}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" />
            Apagar evento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apagar "{titulo}"?</DialogTitle>
          <DialogDescription>
            Isso remove o evento e {totalFotos === 0 ? 'suas fotos' : `suas ${totalFotos} ${totalFotos === 1 ? 'foto' : 'fotos'}`}{' '}
            do site — a página deixa de existir e as fotos saem do ar em alguns segundos. Não dá
            para desfazer por aqui. Seus arquivos originais (RAW e JPEG) não são tocados, então
            é possível enviar as fotos de novo depois.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setAberto(false)
              aoConfirmar()
            }}
          >
            Apagar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

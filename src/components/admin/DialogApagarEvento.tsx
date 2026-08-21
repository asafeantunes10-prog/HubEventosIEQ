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
 * O texto e o ponto mais importante deste componente, nao o botao: "apagar"
 * aqui e apagar o REGISTRO no banco, nao os arquivos. Sem deixar isso claro
 * ANTES do clique de confirmar, alguem apagaria um evento achando que as fotos
 * tambem sumiram do site — e elas continuam la ate o proximo
 * `npm run publicar` de qualquer evento reconstruir o `dist/`.
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
            do banco de dados — a página deixa de existir. As fotos em si NÃO são apagadas do
            disco nem do site publicado: elas continuam ocupando espaço até alguém apagar a
            pasta correspondente em <code>fotos/</code> e publicar de novo.
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

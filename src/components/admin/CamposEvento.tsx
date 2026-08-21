import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { LayoutEvento } from '@/lib/tipos'

export type ValoresCamposEvento = {
  titulo: string
  descricao: string
  dataEvento: string
  corDestaque: string
  layout: LayoutEvento
}

type Props = {
  valores: ValoresCamposEvento
  aoMudarTitulo: (v: string) => void
  aoMudarDescricao: (v: string) => void
  aoMudarData: (v: string) => void
  aoMudarCor: (v: string) => void
  aoMudarLayout: (v: LayoutEvento) => void
  desabilitado?: boolean
}

/** A cor padrao do tema — usada quando o seletor abre sem `corDestaque` definida. */
const COR_PADRAO = '#c9bcab'

/**
 * Os campos de personalizacao que criar e editar um evento tem em comum.
 * `slug` (so faz sentido no momento de criar) e os interruptores de
 * status/visibilidade (so no editar, ja que dependem do evento existir) ficam
 * de fora — cada tela monta o resto ao redor disto.
 */
export function CamposEvento({
  valores,
  aoMudarTitulo,
  aoMudarDescricao,
  aoMudarData,
  aoMudarCor,
  aoMudarLayout,
  desabilitado,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="campo-titulo" className="text-sm font-medium text-foreground">
          Título
        </label>
        <Input
          id="campo-titulo"
          value={valores.titulo}
          onChange={(e) => aoMudarTitulo(e.target.value)}
          disabled={desabilitado}
          placeholder="Culto de Jovens 2026"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campo-descricao" className="text-sm font-medium text-foreground">
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <Textarea
          id="campo-descricao"
          value={valores.descricao}
          onChange={(e) => aoMudarDescricao(e.target.value)}
          disabled={desabilitado}
          placeholder="Um parágrafo curto sobre o evento."
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-data" className="text-sm font-medium text-foreground">
            Data <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input
            id="campo-data"
            type="date"
            value={valores.dataEvento}
            onChange={(e) => aoMudarData(e.target.value)}
            disabled={desabilitado}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-cor" className="text-sm font-medium text-foreground">
            Cor de destaque <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              id="campo-cor"
              type="color"
              value={valores.corDestaque || COR_PADRAO}
              onChange={(e) => aoMudarCor(e.target.value)}
              disabled={desabilitado}
              className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1 md:size-10 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {valores.corDestaque && (
              <button
                type="button"
                onClick={() => aoMudarCor('')}
                disabled={desabilitado}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:pointer-events-none"
              >
                Usar a cor padrão
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Layout da grade</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Layout da grade">
          <Button
            type="button"
            size="sm"
            variant={valores.layout === 'mosaico' ? 'default' : 'outline'}
            aria-pressed={valores.layout === 'mosaico'}
            onClick={() => aoMudarLayout('mosaico')}
            disabled={desabilitado}
          >
            Mosaico
          </Button>
          <Button
            type="button"
            size="sm"
            variant={valores.layout === 'uniforme' ? 'default' : 'outline'}
            aria-pressed={valores.layout === 'uniforme'}
            onClick={() => aoMudarLayout('uniforme')}
            disabled={desabilitado}
          >
            Uniforme
          </Button>
        </div>
      </div>
    </div>
  )
}

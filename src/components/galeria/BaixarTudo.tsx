import * as React from 'react'
import { Ban, Check, Download, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { nomeParaDownload, urlFoto } from '@/lib/fotos'
import { baixarEventoEmZip } from '@/lib/zip'
import type { Foto } from '@/lib/tipos'

type Props = {
  fotos: Foto[]
  slugEvento: string
}

type Estado =
  | { tipo: 'ocioso' }
  | { tipo: 'baixando'; concluidas: number; total: number }
  | { tipo: 'concluido'; caiuParaDownloads: boolean }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; mensagem: string }

/**
 * O botao "Baixar tudo": monta o ZIP do evento inteiro no navegador de quem
 * pediu (o mecanismo inteiro, com os dois caminhos possiveis, esta explicado
 * em `zip.ts`) e mostra o progresso durante — um evento de 500 fotos pode
 * levar minutos, e uma barra parada sem numero faria a pessoa achar que
 * travou e fechar a aba no meio.
 *
 * NAO aparece se `permite_zip` for falso para o evento (quem chama controla
 * isso) nem se nao houver foto nenhuma.
 */
export function BaixarTudo({ fotos, slugEvento }: Props) {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'ocioso' })
  const controladorRef = React.useRef<AbortController | null>(null)

  if (fotos.length === 0) return null

  const iniciar = async () => {
    const controlador = new AbortController()
    controladorRef.current = controlador
    setEstado({ tipo: 'baixando', concluidas: 0, total: fotos.length })

    const paraZip = fotos.map((foto, indice) => ({
      url: urlFoto(foto.caminho, 'g'),
      nome: nomeParaDownload(slugEvento, indice, foto.nomeOriginal),
    }))

    try {
      const resultado = await baixarEventoEmZip(
        paraZip,
        `${slugEvento}.zip`,
        (progresso) => setEstado({ tipo: 'baixando', ...progresso }),
        controlador.signal
      )

      setEstado(
        resultado.cancelado
          ? { tipo: 'cancelado' }
          : { tipo: 'concluido', caiuParaDownloads: resultado.caiuParaDownloads }
      )
    } catch (e) {
      /*
        Cancelar PELO BOTAO abaixo aborta o `sinal` no meio de um fetch, e isso
        sobe como excecao daqui — diferente de fechar o dialogo de "salvar
        como", que `zip.ts` ja trata como `{ cancelado: true }` sem lancar
        nada. Os dois precisam parecer a MESMA coisa para quem esta olhando a
        tela: um cancelamento pedido, nao um erro. `signal.aborted` distingue
        um do outro.
      */
      setEstado(
        controlador.signal.aborted
          ? { tipo: 'cancelado' }
          : {
              tipo: 'erro',
              mensagem: e instanceof Error ? e.message : 'Não consegui preparar o ZIP.',
            }
      )
    } finally {
      controladorRef.current = null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => void iniciar()}
          disabled={estado.tipo === 'baixando'}
          size="lg"
          className="flex-1 md:flex-none"
        >
          {estado.tipo === 'baixando' ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Preparando… {estado.concluidas}/{estado.total}
            </>
          ) : (
            <>
              <Download className="size-4" aria-hidden />
              Baixar tudo ({fotos.length})
            </>
          )}
        </Button>

        {estado.tipo === 'baixando' && (
          <Button onClick={() => controladorRef.current?.abort()} variant="outline">
            <Ban className="size-4" aria-hidden />
            Cancelar
          </Button>
        )}
      </div>

      {estado.tipo === 'baixando' && (
        <div className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-foreground/20">
          <div
            className="h-full bg-destaque transition-[width] duration-300"
            style={{ width: `${(estado.concluidas / Math.max(estado.total, 1)) * 100}%` }}
          />
        </div>
      )}

      {estado.tipo === 'concluido' && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-3.5 text-destaque" aria-hidden />
          {estado.caiuParaDownloads
            ? 'Salvo na pasta de Downloads (não no local escolhido).'
            : 'ZIP salvo.'}
        </p>
      )}

      {estado.tipo === 'erro' && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          {estado.mensagem}
        </p>
      )}
    </div>
  )
}

import * as React from 'react'
import { Link } from 'react-router'
import { ImageOff, Loader2, Pencil, Plus, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogApagarEvento } from '@/components/admin/DialogApagarEvento'
import { apagarEvento, atualizarEvento, listarEventosAdmin, type EventoAdmin } from '@/lib/apiAdmin'
import { urlFoto } from '@/lib/fotos'
import { cn, formatarData } from '@/lib/utils'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; eventos: EventoAdmin[] }

/** A lista de todos os eventos — inclusive rascunho — com as acoes rapidas do admin. */
export function PainelEventos() {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' })

  /*
    So chamado UMA vez, ao montar. O `estado` inicial ja nasce em 'carregando'
    (linha acima), entao nao ha por que o efeito repetir esse `setState` de
    forma sincrona so para "reiniciar" — e e exatamente essa repeticao que o
    lint (`set-state-in-effect`) reclama. As acoes abaixo (alternar status,
    apagar) atualizam a lista em memoria diretamente, sem recarregar do zero.
  */
  React.useEffect(() => {
    let cancelado = false

    listarEventosAdmin()
      .then((eventos) => {
        if (!cancelado) setEstado({ tipo: 'pronto', eventos })
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setEstado({
            tipo: 'erro',
            mensagem: e instanceof Error ? e.message : 'Não consegui carregar os eventos.',
          })
        }
      })

    return () => {
      cancelado = true
    }
  }, [])

  const aoAlternarStatus = async (evento: EventoAdmin) => {
    const novoStatus = evento.status === 'publicado' ? 'rascunho' : 'publicado'

    // Otimista: a lista muda na hora, e volta ao valor original se o servidor recusar.
    setEstado((atual) =>
      atual.tipo === 'pronto'
        ? {
            tipo: 'pronto',
            eventos: atual.eventos.map((e) => (e.id === evento.id ? { ...e, status: novoStatus } : e)),
          }
        : atual
    )

    try {
      await atualizarEvento(evento.id, { status: novoStatus })
    } catch (e) {
      setEstado((atual) =>
        atual.tipo === 'pronto'
          ? { tipo: 'pronto', eventos: atual.eventos.map((ev) => (ev.id === evento.id ? evento : ev)) }
          : atual
      )
      window.alert(e instanceof Error ? e.message : 'Não consegui mudar o status.')
    }
  }

  const aoApagar = async (evento: EventoAdmin) => {
    try {
      await apagarEvento(evento.id)
      setEstado((atual) =>
        atual.tipo === 'pronto'
          ? { tipo: 'pronto', eventos: atual.eventos.filter((e) => e.id !== evento.id) }
          : atual
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não consegui apagar o evento.')
    }
  }

  return (
    <main className="lados-seguros topo-seguro mx-auto w-full max-w-4xl py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl text-champanhe-claro">Eventos</h1>
        <Button asChild size="sm">
          <Link to="/admin/eventos/novo">
            <Plus data-icon="inline-start" />
            Novo evento
          </Link>
        </Button>
      </div>

      <div className="mt-8">
        {estado.tipo === 'carregando' && (
          <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Carregando…
          </div>
        )}

        {estado.tipo === 'erro' && (
          <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-5 text-sm text-destructive">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            {estado.mensagem}
          </div>
        )}

        {estado.tipo === 'pronto' && estado.eventos.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum evento ainda. Comece publicando fotos pelo terminal ou criando um evento
            vazio para preencher antes.
          </p>
        )}

        {estado.tipo === 'pronto' && estado.eventos.length > 0 && (
          <ul className="flex flex-col gap-2">
            {estado.eventos.map((evento) => (
              <li
                key={evento.id}
                className="superficie flex items-center gap-4 rounded-xl p-3 sm:p-4"
              >
                <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {evento.capaCaminho ? (
                    <img
                      src={urlFoto(evento.capaCaminho, 't')}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <ImageOff className="size-5 text-muted-foreground/40" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-heading text-lg leading-snug text-champanhe-claro">
                      {evento.titulo}
                    </h2>
                    <SeloStatus status={evento.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    /e/{evento.slug} · {evento.totalFotos} {evento.totalFotos === 1 ? 'foto' : 'fotos'}
                    {evento.dataEvento && ` · ${formatarData(evento.dataEvento)}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void aoAlternarStatus(evento)}
                  >
                    {evento.status === 'publicado' ? 'Despublicar' : 'Publicar'}
                  </Button>

                  <Button asChild size="icon-sm" variant="ghost">
                    <Link to={`/admin/eventos/${evento.id}`} aria-label={`Editar ${evento.titulo}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Link>
                  </Button>

                  <DialogApagarEvento
                    titulo={evento.titulo}
                    totalFotos={evento.totalFotos}
                    aoConfirmar={() => void aoApagar(evento)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function SeloStatus({ status }: { status: EventoAdmin['status'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase',
        status === 'publicado'
          ? 'bg-primary/20 text-primary'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {status === 'publicado' ? 'Publicado' : 'Rascunho'}
    </span>
  )
}

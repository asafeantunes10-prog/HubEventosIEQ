import * as React from 'react'
import { Camera, Loader2, TriangleAlert } from 'lucide-react'

import { CartaoEvento } from '@/components/CartaoEvento'
import { listarEventos } from '@/lib/api'
import type { EventoComCapa } from '@/lib/tipos'
import seloQuadrangular from '@/assets/marca/quadrangular-ms.png'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; eventos: EventoComCapa[] }
  | { tipo: 'erro'; mensagem: string }

/**
 * A capa do site: o texto explicando o que e o hub, e a grade de eventos.
 *
 * Busca a lista uma vez, ao montar. Nao ha filtro nem busca aqui — com um
 * evento por mes (a cadencia que o plano assume), uma pessoa rolando a pagina
 * acha o que quer mais rapido do que digitando numa caixa de busca.
 */
export function Home() {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' })

  React.useEffect(() => {
    let cancelado = false

    listarEventos()
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

    // Evita `setState` numa tela que a pessoa ja fechou — a busca pode voltar
    // depois do componente ter desmontado.
    return () => {
      cancelado = true
    }
  }, [])

  return (
    // O fundo da identidade cobre a tela inteira; o `<main>` continua so o
    // dono do respiro e da largura maxima, como antes.
    <div className="fundo-identidade min-h-svh">
      <main className="lados-seguros topo-seguro mx-auto w-full max-w-5xl py-16 sm:py-20">
        <header className="max-w-prose">
          <span className="flex items-center gap-2.5">
            <img
              src={seloQuadrangular}
              alt=""
              className="size-6 rounded-full ring-1 ring-champanhe-claro/40"
            />
            <span className="rotulo-seccao">Igreja do Evangelho Quadrangular</span>
          </span>

          <h1 className="titulo-metal font-heading mt-4 text-4xl tracking-tight sm:text-6xl">
            Fotos dos eventos
          </h1>

          <p className="mt-6 leading-relaxed text-muted-foreground">
            Fotos de todos os eventos da igreja. É só clicar para baixar e compartilhar nas
            suas redes sociais.
          </p>
        </header>

        <section className="mt-14">
          {estado.tipo === 'carregando' && (
            <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Carregando os eventos…
            </div>
          )}

          {estado.tipo === 'erro' && (
            <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-5 text-sm text-destructive">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              {estado.mensagem}
            </div>
          )}

          {estado.tipo === 'pronto' && estado.eventos.length === 0 && (
            <div className="superficie-identidade flex items-center gap-4 rounded-xl p-5">
              <Camera className="size-5 shrink-0 text-marca-dourado" aria-hidden />
              <p className="text-sm leading-relaxed text-champanhe-claro/80">
                Nenhum evento publicado ainda. Volte em breve.
              </p>
            </div>
          )}

          {estado.tipo === 'pronto' && estado.eventos.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {estado.eventos.map((evento) => (
                <CartaoEvento key={evento.id} evento={evento} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

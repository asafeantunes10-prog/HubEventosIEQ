import * as React from 'react'
import { Link } from 'react-router'
import { Camera, Loader2, TriangleAlert } from 'lucide-react'

import { CartaoEvento } from '@/components/CartaoEvento'
import { CapaEvento } from '@/components/CapaEvento'
import { Marca } from '@/components/Marca'
import { Rodape } from '@/components/Rodape'
import { listarEventos } from '@/lib/api'
import { ehCapaVertical } from '@/lib/fotos'
import { cn, formatarData } from '@/lib/utils'
import type { EventoComCapa } from '@/lib/tipos'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; eventos: EventoComCapa[] }
  | { tipo: 'erro'; mensagem: string }

/**
 * Do evento mais novo para o mais antigo.
 *
 * `dataEvento` e AAAA-MM-DD, entao a ordem alfabetica E a ordem do calendario.
 * Evento sem data cai para o fim (texto vazio ordena antes de qualquer data,
 * e a ordem aqui e decrescente). O `sort` e estavel: eventos sem data
 * mantem a ordem que a API devolveu.
 */
function maisRecentePrimeiro(eventos: EventoComCapa[]): EventoComCapa[] {
  return [...eventos].sort((a, b) => (b.dataEvento ?? '').localeCompare(a.dataEvento ?? ''))
}

function rotuloVerFotos(total: number): string {
  if (total === 0) return 'Ver o evento'
  return total === 1 ? 'Ver a foto' : `Ver as ${total} fotos`
}

/**
 * A capa do site: o evento mais recente em destaque e, abaixo, os anteriores.
 *
 * O destaque e sempre o evento de data mais nova — nao um evento "fixado" a
 * mao —, para quem chega saber que ali esta o que aconteceu por ultimo.
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

  const ordenados = estado.tipo === 'pronto' ? maisRecentePrimeiro(estado.eventos) : []
  const [maisRecente, ...anteriores] = ordenados
  const vertical = ehCapaVertical(maisRecente?.capa)

  return (
    <div>
      {/*
        No celular: ceu, logo, titulo e o cartao do evento mais recente, tudo na
        primeira tela. No computador o cartao vira o fundo inteiro do cabecalho
        (foto em tela cheia) e o titulo "Fotos dos eventos" vira so texto para
        leitor de tela — quem manda ali e o nome do evento.

        O respiro de cima usa `max()` direto (e nao a classe `topo-seguro`): um
        utilitario `pt-*` ganharia dela em silencio e a ilha do iPhone cobriria o logo.
      */}
      <header
        className={cn(
          'ceu lados-amplos relative pt-[max(1.25rem,env(safe-area-inset-top))] pb-12',
          maisRecente &&
            'md:min-h-[820px] md:pt-[max(1.75rem,env(safe-area-inset-top))] md:pb-0',
          // Capa horizontal: a foto cobre o cabecalho (sem ceu atras). Vertical: o ceu fica.
          maisRecente && (vertical ? 'ceu-pc' : 'md:bg-none')
        )}
      >
        <Marca className="relative z-10 w-56 max-w-[70%] md:w-[200px]" />

        <h1
          className={cn(
            'mt-[22px] font-heading text-[30px] leading-[1.1]',
            maisRecente && 'md:sr-only'
          )}
        >
          Fotos dos eventos
        </h1>

        {maisRecente && <Destaque evento={maisRecente} vertical={vertical} />}
      </header>

      {/*
        A folha: onde mora a lista. Sobe por cima do fim do cabecalho (`-mt-*`) com
        os cantos de cima arredondados, e e o que separa "o destaque" de "o resto".
        O cabecalho tem folga embaixo (`pb-12`) maior que a subida, para a folha
        nunca encostar no cartao do destaque.
      */}
      <div className="folha relative z-10 -mt-7 md:-mt-10">
        <main className="lados-amplos pt-7 pb-10 md:pt-14 md:pb-16">
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

          {estado.tipo === 'pronto' && ordenados.length === 0 && (
            <div className="superficie flex items-center gap-4 rounded-xl p-5">
              <Camera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nenhum evento publicado ainda. Volte em breve.
              </p>
            </div>
          )}

          {estado.tipo === 'pronto' && ordenados.length > 0 && anteriores.length === 0 && (
            <p className="text-center text-base text-muted-foreground">
              Este é o único evento por enquanto. Os próximos aparecem aqui.
            </p>
          )}

          {anteriores.length > 0 && (
            <section className="mx-auto max-w-[1328px]" aria-labelledby="titulo-anteriores">
              <div className="mb-4 flex items-baseline justify-between gap-4 md:mb-8">
                <h2
                  id="titulo-anteriores"
                  className="font-etiqueta text-[27px] leading-[1.1] font-normal tracking-[0.02em] md:text-[36px]"
                >
                  Eventos anteriores
                </h2>

                <span className="shrink-0 text-sm text-muted-foreground md:text-base">
                  {anteriores.length} {anteriores.length === 1 ? 'evento' : 'eventos'}
                </span>
              </div>

              <ul className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {anteriores.map((evento) => (
                  <li key={evento.id}>
                    <CartaoEvento evento={evento} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>

      <Rodape />
    </div>
  )
}

/** "Mais recente": a etiqueta que explica por que este evento esta em destaque. */
function Etiqueta({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[34px] items-center gap-2 rounded-full bg-primary px-3.5 font-etiqueta text-[15px] leading-none text-primary-foreground md:min-h-[38px] md:px-[18px] md:text-[17px]',
        className
      )}
    >
      <span className="size-2 rounded-full bg-[#1b9be8]" aria-hidden />
      Mais recente
    </span>
  )
}

function Destaque({ evento, vertical }: { evento: EventoComCapa; vertical: boolean }) {
  const capa = evento.capa

  return (
    <Link
      to={`/e/${evento.slug}`}
      className="group relative mt-4 block aspect-[4/5] overflow-hidden rounded-[22px] bg-card outline-none focus-visible:ring-4 focus-visible:ring-ring md:absolute md:inset-0 md:mt-0 md:aspect-auto md:rounded-none md:bg-transparent"
    >
      {capa && <CapaEvento capa={capa} arquivado={evento.arquivado} vertical={vertical} />}

      {/* Capa vertical no computador: o texto fica sobre o ceu, sem veu escuro. */}
      <div className={cn('veu-inferior absolute inset-0', vertical && 'md:hidden')} aria-hidden />
      <div
        className={cn('veu-superior absolute inset-x-0 top-0 hidden h-48', !vertical && 'md:block')}
        aria-hidden
      />

      <Etiqueta className="absolute top-3.5 left-3.5 md:hidden" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-[18px] md:items-start md:gap-6 md:px-14 md:pb-16">
        <Etiqueta className="hidden md:inline-flex" />

        <h2 className="font-heading text-[29px] leading-[1.08] text-balance md:max-w-[8em] md:text-[80px] md:leading-none">
          {evento.titulo}
        </h2>

        <div className="flex flex-col gap-1.5 md:flex-row-reverse md:items-center md:justify-end md:gap-8">
          {evento.dataEvento && (
            <p className="text-[17px] text-foreground/90 md:text-[19px]">
              {formatarData(evento.dataEvento)}
            </p>
          )}

          <span className="mt-3 flex min-h-[54px] items-center justify-center rounded-full bg-primary px-8 font-heading text-[19px] font-semibold text-primary-foreground transition-transform group-hover:scale-[1.02] md:mt-0 md:inline-flex md:min-h-14 md:text-xl">
            {rotuloVerFotos(evento.totalFotos)}
          </span>
        </div>
      </div>
    </Link>
  )
}

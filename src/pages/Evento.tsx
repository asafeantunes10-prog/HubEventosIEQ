import * as React from 'react'
import { Link, useParams } from 'react-router'
import { CalendarDays, ChevronLeft, Images, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CapaEvento } from '@/components/CapaEvento'
import { Marca } from '@/components/Marca'
import { Rodape } from '@/components/Rodape'
import { BaixarTudo } from '@/components/galeria/BaixarTudo'
import { GradeFotos } from '@/components/galeria/GradeFotos'
import { Visualizador } from '@/components/galeria/Visualizador'
import { buscarEvento, ErroApi } from '@/lib/api'
import { ehCapaVertical, nomeParaDownload, urlFoto } from '@/lib/fotos'
import { baixarUma } from '@/lib/zip'
import { cn, formatarData } from '@/lib/utils'
import type { EventoComFotos, Foto } from '@/lib/tipos'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; dados: EventoComFotos }

/**
 * `/e/:slug`. So extrai o parametro e repassa via `key`.
 *
 * O `key={slug}` e o que da o reinicio limpo quando a pessoa navega de um
 * evento para outro direto (o link "Todos os eventos" nunca faz isso, mas um
 * `<Link>` de um evento para outro poderia existir um dia): com o `key` preso
 * ao slug, o React descarta o componente antigo inteiro e monta um novo do
 * zero, cujo `useState` ja nasce em `carregando` — sem precisar de um
 * `setState` sincrono dentro do efeito so para forcar essa volta ao inicio.
 */
export function Evento() {
  const { slug } = useParams<{ slug: string }>()
  return <PaginaEvento key={slug} slug={slug} />
}

/** O hub de fotos de um evento: cabecalho, grade, visualizador e download. */
function PaginaEvento({ slug }: { slug: string | undefined }) {
  const [estado, setEstado] = React.useState<Estado>({ tipo: 'carregando' })
  const [indiceAberto, setIndiceAberto] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!slug) return

    let cancelado = false

    buscarEvento(slug)
      .then((dados) => {
        if (!cancelado) setEstado({ tipo: 'pronto', dados })
      })
      .catch((e: unknown) => {
        if (cancelado) return

        if (e instanceof ErroApi && e.status === 404) {
          setEstado({ tipo: 'nao-encontrado' })
        } else {
          setEstado({
            tipo: 'erro',
            mensagem: e instanceof Error ? e.message : 'Não consegui carregar este evento.',
          })
        }
      })

    return () => {
      cancelado = true
    }
  }, [slug])

  const aoBaixarFoto = React.useCallback(
    async (foto: Foto, indice: number, slugEvento: string, temVersaoGrande: boolean) => {
      // Defesa a mais: com o evento arquivado a `-g.webp` nao existe mais no
      // site, e nenhum botao desta tela deveria chamar isto — mas um botao
      // escondido errado no futuro nao pode virar um download quebrado.
      if (!temVersaoGrande) return

      try {
        await baixarUma(urlFoto(foto.caminho, 'g'), nomeParaDownload(slugEvento, indice, foto.nomeOriginal))
      } catch (e) {
        // A foto continua na tela e a pessoa pode tentar de novo — um download
        // que falha nao deveria derrubar a galeria inteira.
        console.error('Falha ao baixar foto:', e)
      }
    },
    []
  )

  if (estado.tipo === 'carregando') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-5xl items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando o evento…
        </div>
      </main>
    )
  }

  if (estado.tipo === 'nao-encontrado') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="font-heading text-2xl text-foreground">Não encontrei esse evento</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          O link pode estar errado, ou o evento ainda não foi publicado.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/">
            <ChevronLeft data-icon="inline-start" />
            Ver todos os eventos
          </Link>
        </Button>
      </main>
    )
  }

  if (estado.tipo === 'erro') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
        <p className="mt-4 leading-relaxed text-muted-foreground">{estado.mensagem}</p>
        <Button size="lg" variant="outline" className="mt-8" onClick={() => window.location.reload()}>
          Tentar de novo
        </Button>
      </main>
    )
  }

  const { evento, fotos } = estado.dados

  /*
    `arquivado` tira do ar so a versao -g (2048px) — ver `functions/lib/publicacao.ts`.
    A partir daqui, tudo que pediria essa versao (ZIP, download avulso, a foto
    grande do visualizador) precisa saber disso, ou o resultado e um download
    quebrado ou uma imagem quebrada em tela cheia, nao so um botao a menos.
  */
  const temVersaoGrande = !evento.arquivado

  // A capa escolhida no painel, ou a primeira foto quando ninguem escolheu.
  const capa = fotos.find((f) => f.id === evento.capaId) ?? fotos[0] ?? null
  const vertical = ehCapaVertical(capa)

  return (
    <div
      // A personalizacao por evento: `cor_destaque` sobrescreve `--destaque` so
      // dentro deste wrapper. So pinta elementos graficos (a barra do ZIP) — o
      // design system inteiro e baseado em variaveis CSS, entao isto e uma linha
      // de `style`, nao um tema paralelo.
      style={evento.corDestaque ? ({ '--destaque': evento.corDestaque } as React.CSSProperties) : undefined}
    >
      <header className="relative">
        {/*
          No celular a barra fica sobre o ceu, acima da foto; no computador ela
          flutua sobre a foto da capa (por isso `md:bg-none`: sem ceu atras).
        */}
        <nav className="ceu lados-amplos flex items-center justify-between gap-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:absolute md:inset-x-0 md:top-0 md:z-10 md:bg-transparent md:bg-none md:pt-[max(1.5rem,env(safe-area-inset-top))]">
          <Link
            to="/"
            className="inline-flex min-h-12 items-center gap-1.5 rounded-full pr-2.5 text-[17px] font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-[22px]" aria-hidden />
            Todos os eventos
          </Link>

          <Link to="/" className="rounded-md outline-none focus-visible:ring-4 focus-visible:ring-ring">
            <Marca className="w-24 md:w-[150px]" />
          </Link>
        </nav>

        <div
          className={cn(
            'relative aspect-square overflow-hidden bg-card md:aspect-auto md:min-h-[620px]',
            // Capa vertical no computador: a foto fica a direita e o ceu atras do titulo.
            vertical && 'ceu-pc'
          )}
        >
          {capa && <CapaEvento capa={capa} arquivado={evento.arquivado} vertical={vertical} />}

          <div className={cn('veu-inferior absolute inset-0', vertical && 'md:hidden')} aria-hidden />
          <div
            className={cn('veu-superior absolute inset-x-0 top-0 hidden h-44', !vertical && 'md:block')}
            aria-hidden
          />

          <div className="lados-amplos absolute inset-x-0 bottom-0 pt-4 pb-12 md:pb-20">
            <h1 className="font-heading text-[29px] leading-[1.08] text-balance md:max-w-[8.5em] md:text-[72px] md:leading-[1.02]">
              {evento.titulo}
            </h1>
          </div>
        </div>
      </header>

      {/*
        A folha: sobe por cima do fim do hero (`-mt-*`) e junta o que e "sobre o
        evento" (o painel de informacoes) e o que e "as fotos" (o mural), cada um
        com a sua area. O titulo do hero tem folga embaixo (`pb-12`/`pb-20`) maior
        que a subida, para a folha nunca cobrir o nome do evento.
      */}
      <div className="folha relative z-10 -mt-7 md:-mt-10">
        <section className="lados-amplos pt-5 md:pt-8" aria-label="Sobre o evento">
          <div className="mx-auto max-w-[1328px]">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.06] p-4 md:flex-row md:items-center md:justify-between md:gap-6 md:p-5">
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-8">
                {evento.dataEvento && (
                  <p className="flex items-center gap-2.5 text-base md:text-lg">
                    <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    {formatarData(evento.dataEvento)}
                  </p>
                )}

                <p className="flex items-center gap-2.5 text-base md:text-lg">
                  <Images className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
                </p>
              </div>

              {evento.permiteZip && temVersaoGrande && (
                <div className="w-full md:w-auto">
                  <BaixarTudo fotos={fotos} slugEvento={evento.slug} />
                </div>
              )}
            </div>

            {evento.descricao && (
              <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">
                {evento.descricao}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="titulo-fotos" className="pt-7 pb-8 md:pt-12 md:pb-14">
          <div className="lados-amplos mb-3 md:mb-5">
            <div className="mx-auto flex max-w-[1328px] items-baseline justify-between gap-4">
              <h2
                id="titulo-fotos"
                className="font-etiqueta text-2xl leading-[1.1] font-normal tracking-[0.02em] md:text-[32px]"
              >
                Todas as fotos
              </h2>

              {fotos.length > 0 && (
                <span className="text-right text-sm text-muted-foreground md:text-base">
                  <span className="md:hidden">Toque</span>
                  <span className="hidden md:inline">Clique</span> para ampliar
                </span>
              )}
            </div>
          </div>

          <div className="p-1 md:p-1.5">
            <GradeFotos
              // Forca remontar ao trocar de evento: zera sozinho a contagem de cartoes
              // revelados (ver GradeFotos) sem precisar de um efeito so para isso.
              key={evento.slug}
              fotos={fotos}
              layout={evento.layout}
              temVersaoGrande={temVersaoGrande}
              aoAbrir={setIndiceAberto}
              aoBaixar={(foto, indice) => void aoBaixarFoto(foto, indice, evento.slug, temVersaoGrande)}
            />
          </div>
        </section>
      </div>

      <Rodape />

      {indiceAberto !== null && (
        <Visualizador
          fotos={fotos}
          indice={indiceAberto}
          temVersaoGrande={temVersaoGrande}
          aoFechar={() => setIndiceAberto(null)}
          aoNavegar={setIndiceAberto}
          aoBaixar={(foto, indice) => void aoBaixarFoto(foto, indice, evento.slug, temVersaoGrande)}
        />
      )}
    </div>
  )
}

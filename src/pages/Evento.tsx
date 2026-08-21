import * as React from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BaixarTudo } from '@/components/galeria/BaixarTudo'
import { GradeFotos } from '@/components/galeria/GradeFotos'
import { Visualizador } from '@/components/galeria/Visualizador'
import { buscarEvento, ErroApi } from '@/lib/api'
import { nomeParaDownload, urlFoto } from '@/lib/fotos'
import { baixarUma } from '@/lib/zip'
import { formatarData } from '@/lib/utils'
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
        <h1 className="font-heading text-2xl text-champanhe-claro">Não encontrei esse evento</h1>
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
    `arquivado` apaga so a versao -g (2048px) no disco — ver `scripts/arquivar.mjs`.
    A partir daqui, tudo que pediria essa versao (ZIP, download avulso, a foto
    grande do visualizador) precisa saber disso, ou o resultado e um download
    quebrado ou uma imagem quebrada em tela cheia, nao so um botao a menos.
  */
  const temVersaoGrande = !evento.arquivado

  return (
    <main
      className="lados-seguros topo-seguro mx-auto w-full max-w-6xl py-10 sm:py-14"
      // A personalizacao por evento: `cor_destaque` sobrescreve `--primary` so
      // dentro deste wrapper. O design system inteiro e baseado em variaveis
      // CSS, entao isto e uma linha de `style`, nao um tema paralelo.
      style={evento.corDestaque ? ({ '--primary': evento.corDestaque } as React.CSSProperties) : undefined}
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Todos os eventos
      </Link>

      <header className="mt-6 max-w-prose">
        <h1 className="font-heading text-3xl tracking-tight text-champanhe-claro sm:text-5xl">
          {evento.titulo}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {evento.dataEvento && `${formatarData(evento.dataEvento)} · `}
          {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
        </p>

        {evento.descricao && (
          <p className="mt-4 leading-relaxed text-muted-foreground">{evento.descricao}</p>
        )}

        {evento.permiteZip && temVersaoGrande && (
          <div className="mt-5">
            <BaixarTudo fotos={fotos} slugEvento={evento.slug} />
          </div>
        )}
      </header>

      <div className="mt-10">
        <GradeFotos
          fotos={fotos}
          layout={evento.layout}
          temVersaoGrande={temVersaoGrande}
          aoAbrir={setIndiceAberto}
          aoBaixar={(foto, indice) => void aoBaixarFoto(foto, indice, evento.slug, temVersaoGrande)}
        />
      </div>

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
    </main>
  )
}

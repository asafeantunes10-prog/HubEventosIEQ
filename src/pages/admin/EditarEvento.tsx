import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, Check, ChevronLeft, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CamposEvento, type ValoresCamposEvento } from '@/components/admin/CamposEvento'
import { GerenciarFotos } from '@/components/admin/GerenciarFotos'
import { DialogApagarEvento } from '@/components/admin/DialogApagarEvento'
import { ErroApi } from '@/lib/api'
import {
  apagarEvento,
  apagarFotos,
  atualizarEvento,
  buscarEventoAdmin,
  publicarFotos,
  reordenarFotos,
  type FotoAdmin,
} from '@/lib/apiAdmin'
import type { Evento } from '@/lib/tipos'

// Carregado so quando alguem abre esta tela: leva junto o codificador de WebP e o
// leitor de EXIF, que o site publico nunca precisa baixar.
const EnviarFotos = React.lazy(() =>
  import('@/components/admin/EnviarFotos').then((m) => ({ default: m.EnviarFotos }))
)

type EstadoCarga =
  | { tipo: 'carregando' }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto' }

/**
 * `/admin/eventos/:id`. So extrai o parametro e repassa via `key`, pelo mesmo
 * motivo do `Evento.tsx` publico: o reinicio limpo ao trocar de evento vem do
 * proprio ciclo de vida do componente, sem `setState` sincrono num efeito.
 */
export function EditarEvento() {
  const { id } = useParams<{ id: string }>()
  return <PaginaEditar key={id} id={id} />
}

function PaginaEditar({ id }: { id: string | undefined }) {
  const navegar = useNavigate()

  const [estadoCarga, setEstadoCarga] = React.useState<EstadoCarga>({ tipo: 'carregando' })
  const [evento, setEvento] = React.useState<Evento | null>(null)
  const [fotos, setFotos] = React.useState<FotoAdmin[]>([])

  const [valores, setValores] = React.useState<ValoresCamposEvento>({
    titulo: '',
    descricao: '',
    dataEvento: '',
    corDestaque: '',
    layout: 'mosaico',
  })
  const [listado, setListado] = React.useState(true)
  const [destaque, setDestaque] = React.useState(false)
  const [permiteZip, setPermiteZip] = React.useState(true)

  const [salvando, setSalvando] = React.useState(false)
  const [salvo, setSalvo] = React.useState(false)
  const [erroSalvar, setErroSalvar] = React.useState<string | null>(null)
  const [alternandoStatus, setAlternandoStatus] = React.useState(false)
  // Mensagem enquanto o site e atualizado depois de apagar foto ou arquivar.
  const [atualizandoSite, setAtualizandoSite] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) return
    let cancelado = false

    buscarEventoAdmin(id)
      .then(({ evento: e, fotos: f }) => {
        if (cancelado) return
        setEvento(e)
        setFotos(f)
        setValores({
          titulo: e.titulo,
          descricao: e.descricao ?? '',
          dataEvento: e.dataEvento ?? '',
          corDestaque: e.corDestaque ?? '',
          layout: e.layout,
        })
        setListado(e.listado)
        setDestaque(e.destaque)
        setPermiteZip(e.permiteZip)
        setEstadoCarga({ tipo: 'pronto' })
      })
      .catch((erro: unknown) => {
        if (cancelado) return
        setEstadoCarga(
          erro instanceof ErroApi && erro.status === 404
            ? { tipo: 'nao-encontrado' }
            : {
                tipo: 'erro',
                mensagem: erro instanceof Error ? erro.message : 'Não consegui carregar este evento.',
              }
        )
      })

    return () => {
      cancelado = true
    }
  }, [id])

  const aoSalvarCampos = async (evt: React.FormEvent) => {
    evt.preventDefault()
    if (!evento || salvando) return

    setSalvando(true)
    setErroSalvar(null)
    setSalvo(false)

    try {
      const atualizado = await atualizarEvento(evento.id, {
        titulo: valores.titulo,
        descricao: valores.descricao || null,
        dataEvento: valores.dataEvento || null,
        corDestaque: valores.corDestaque || null,
        layout: valores.layout,
        listado,
        destaque,
        permiteZip,
      })
      setEvento(atualizado)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
    } catch (e) {
      setErroSalvar(e instanceof Error ? e.message : 'Não consegui salvar as alterações.')
    } finally {
      setSalvando(false)
    }
  }

  const aoAlternarStatus = async () => {
    if (!evento || alternandoStatus) return

    setAlternandoStatus(true)
    const novoStatus = evento.status === 'publicado' ? 'rascunho' : 'publicado'

    try {
      setEvento(await atualizarEvento(evento.id, { status: novoStatus }))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não consegui mudar o status.')
    } finally {
      setAlternandoStatus(false)
    }
  }

  const aoDefinirCapa = async (fotoId: string) => {
    if (!evento) return

    const capaAnterior = evento.capaId
    setEvento({ ...evento, capaId: fotoId }) // otimista: a estrela muda na hora

    try {
      await atualizarEvento(evento.id, { capaId: fotoId })
    } catch (e) {
      setEvento((atual) => (atual ? { ...atual, capaId: capaAnterior } : atual))
      window.alert(e instanceof Error ? e.message : 'Não consegui definir a capa.')
    }
  }

  const aoMoverFoto = async (indice: number, direcao: -1 | 1) => {
    if (!evento) return

    const destino = indice + direcao
    if (destino < 0 || destino >= fotos.length) return

    const anteriores = fotos
    const novas = [...fotos]
    ;[novas[indice], novas[destino]] = [novas[destino], novas[indice]]
    setFotos(novas) // otimista: a grade reordena na hora

    try {
      await reordenarFotos(evento.id, novas.map((f) => f.id))
    } catch (e) {
      setFotos(anteriores)
      window.alert(e instanceof Error ? e.message : 'Não consegui reordenar as fotos.')
    }
  }

  /** Recarrega as fotos (e a capa) depois de um envio, sem mexer no formulario. */
  const recarregarFotos = React.useCallback(() => {
    if (!id) return
    buscarEventoAdmin(id)
      .then(({ evento: e, fotos: f }) => {
        setEvento(e)
        setFotos(f)
      })
      .catch(() => {
        // Falhou so a atualizacao da lista; a tela continua mostrando a anterior.
      })
  }, [id])

  const aoApagarFoto = async (fotoId: string) => {
    if (!evento) return
    if (!window.confirm('Apagar esta foto do evento? Ela sai do site em alguns segundos.')) return

    const anteriores = fotos
    setFotos(fotos.filter((f) => f.id !== fotoId)) // otimista: some da grade na hora
    setAtualizandoSite('Tirando a foto do ar…')

    try {
      await apagarFotos(evento.id, [fotoId])
      // O arquivo so sai do ar com um novo deploy do projeto de fotos.
      await publicarFotos()
    } catch (e) {
      setFotos(anteriores)
      window.alert(e instanceof Error ? e.message : 'Não consegui apagar a foto.')
    } finally {
      setAtualizandoSite(null)
      recarregarFotos()
    }
  }

  const aoArquivar = async () => {
    if (!evento) return
    const ok = window.confirm(
      'Arquivar libera espaço no site: as versões grandes das fotos saem do ar e ficam só as ' +
        'miniaturas. O download deste evento deixa de funcionar e NÃO dá para desfazer por aqui ' +
        '(só enviando as fotos de novo). Continuar?'
    )
    if (!ok) return

    setAtualizandoSite('Arquivando o evento…')
    try {
      // Primeiro o banco (as telas passam a usar so a miniatura), depois o deploy que tira o arquivo.
      setEvento(await atualizarEvento(evento.id, { arquivado: true }))
      await publicarFotos()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não consegui arquivar o evento.')
    } finally {
      setAtualizandoSite(null)
      recarregarFotos()
    }
  }

  const aoApagar = async () => {
    if (!evento) return
    try {
      await apagarEvento(evento.id)
      // Sem este deploy as fotos do evento apagado continuariam no ar.
      if (fotos.length > 0) await publicarFotos().catch(() => {})
      navegar('/admin')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não consegui apagar o evento.')
    }
  }

  if (estadoCarga.tipo === 'carregando') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando…
        </div>
      </main>
    )
  }

  if (estadoCarga.tipo === 'nao-encontrado') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="font-heading text-2xl text-champanhe-claro">Evento não encontrado</h1>
        <Button asChild size="lg" className="mt-8">
          <Link to="/admin">
            <ChevronLeft data-icon="inline-start" />
            Todos os eventos
          </Link>
        </Button>
      </main>
    )
  }

  if (estadoCarga.tipo === 'erro') {
    return (
      <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
        <p className="mt-4 text-muted-foreground">{estadoCarga.mensagem}</p>
      </main>
    )
  }

  // `estadoCarga.tipo === 'pronto'` implica `evento` preenchido; a checagem e
  // so para o TypeScript, que nao enxerga essa relacao entre os dois estados.
  if (!evento) return null

  return (
    <main className="lados-seguros topo-seguro mx-auto w-full max-w-3xl py-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Todos os eventos
        </Link>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void aoAlternarStatus()}
          disabled={alternandoStatus}
        >
          {alternandoStatus ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : evento.status === 'publicado' ? (
            'Despublicar'
          ) : (
            'Publicar'
          )}
        </Button>
      </div>

      <h1 className="font-heading mt-4 text-3xl text-champanhe-claro">{evento.titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">/e/{evento.slug}</p>

      <form
        onSubmit={(evt) => void aoSalvarCampos(evt)}
        className="superficie mt-8 flex flex-col gap-6 rounded-xl p-5 sm:p-6"
      >
        <CamposEvento
          valores={valores}
          aoMudarTitulo={(v) => setValores((a) => ({ ...a, titulo: v }))}
          aoMudarDescricao={(v) => setValores((a) => ({ ...a, descricao: v }))}
          aoMudarData={(v) => setValores((a) => ({ ...a, dataEvento: v }))}
          aoMudarCor={(v) => setValores((a) => ({ ...a, corDestaque: v }))}
          aoMudarLayout={(v) => setValores((a) => ({ ...a, layout: v }))}
          desabilitado={salvando}
        />

        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <CampoInterruptor
            titulo="Aparece na home"
            descricao="Desligado, o evento só abre por quem tem o link direto."
            valor={listado}
            aoMudar={setListado}
            desabilitado={salvando}
          />
          <CampoInterruptor
            titulo="Destaque"
            descricao="Fixa este evento no topo da lista da home."
            valor={destaque}
            aoMudar={setDestaque}
            desabilitado={salvando}
          />
          <CampoInterruptor
            titulo="Permite baixar tudo em ZIP"
            descricao="Desligado, só o download foto a foto continua disponível."
            valor={permiteZip}
            aoMudar={setPermiteZip}
            desabilitado={salvando}
          />
        </div>

        {erroSalvar && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {erroSalvar}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {salvo && (
            <span className="flex items-center gap-1.5 text-sm text-primary">
              <Check className="size-4" aria-hidden />
              Salvo
            </span>
          )}
          <Button type="submit" disabled={salvando || !valores.titulo.trim()}>
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              'Salvar alterações'
            )}
          </Button>
        </div>
      </form>

      <section className="mt-10">
        <h2 className="font-heading text-xl text-champanhe-claro">Enviar fotos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha as fotos ou a pasta do evento. Enviar a mesma pasta de novo é seguro: o que já foi
          enviado é pulado.
        </p>
        <div className="mt-4">
          {evento.arquivado ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Este evento está arquivado, então não recebe fotos novas.
            </p>
          ) : (
            <React.Suspense
              fallback={
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Preparando o envio…
                </div>
              }
            >
              <EnviarFotos eventoId={evento.id} fotosAtuais={fotos} aoTerminar={recarregarFotos} />
            </React.Suspense>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-xl text-champanhe-claro">
          Fotos <span className="text-base font-normal text-muted-foreground">({fotos.length})</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reordene com as setas e clique em "Definir capa" na foto que deve aparecer na home.
        </p>
        {atualizandoSite && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {atualizandoSite}
          </p>
        )}
        <div className="mt-4">
          <GerenciarFotos
            fotos={fotos}
            capaId={evento.capaId}
            aoMoverFoto={(indice, direcao) => void aoMoverFoto(indice, direcao)}
            aoDefinirCapa={(fotoId) => void aoDefinirCapa(fotoId)}
            aoApagarFoto={(fotoId) => void aoApagarFoto(fotoId)}
          />
        </div>

        {!evento.arquivado && fotos.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div className="text-sm">
              <p className="font-medium text-foreground">Arquivar evento</p>
              <p className="text-muted-foreground">
                Para eventos antigos: libera espaço no site mantendo só as miniaturas.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void aoArquivar()}
              disabled={atualizandoSite !== null}
            >
              <Archive className="size-4" aria-hidden />
              Arquivar
            </Button>
          </div>
        )}
        {evento.arquivado && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Archive className="size-4" aria-hidden />
            Evento arquivado: só as miniaturas estão no ar e o download está desligado.
          </p>
        )}
      </section>

      <section className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 p-5">
        <div>
          <h2 className="font-heading text-lg text-destructive">Zona de risco</h2>
          <p className="mt-1 text-sm text-muted-foreground">Apaga o registro deste evento.</p>
        </div>
        <DialogApagarEvento
          titulo={evento.titulo}
          totalFotos={fotos.length}
          aoConfirmar={() => void aoApagar()}
          variante="botao"
        />
      </section>
    </main>
  )
}

function CampoInterruptor({
  titulo,
  descricao,
  valor,
  aoMudar,
  desabilitado,
}: {
  titulo: string
  descricao: string
  valor: boolean
  aoMudar: (v: boolean) => void
  desabilitado?: boolean
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-foreground">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{descricao}</span>
      </span>
      <Switch checked={valor} onCheckedChange={aoMudar} disabled={desabilitado} />
    </label>
  )
}

import * as React from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CamposEvento, type ValoresCamposEvento } from '@/components/admin/CamposEvento'
import { criarEvento } from '@/lib/apiAdmin'
import { paraSlug } from '@/lib/utils'

const VALORES_INICIAIS: ValoresCamposEvento = {
  titulo: '',
  descricao: '',
  dataEvento: '',
  corDestaque: '',
  layout: 'mosaico',
}

/**
 * Cria um evento vazio — sem fotos ainda. Serve para preparar titulo,
 * descricao e data ANTES do `npm run publicar` rodar, ou simplesmente para ter
 * o endereco pronto para divulgar.
 *
 * O slug segue o titulo automaticamente ATE a pessoa editar o campo na mao —
 * dai para em diante o automatico para, porque ela decidiu um valor proprio.
 */
export function NovoEvento() {
  const navegar = useNavigate()
  const [valores, setValores] = React.useState(VALORES_INICIAIS)
  const [slug, setSlug] = React.useState('')
  const [slugTocado, setSlugTocado] = React.useState(false)
  const [salvando, setSalvando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const aoMudarTitulo = (v: string) => {
    setValores((atuais) => ({ ...atuais, titulo: v }))
    if (!slugTocado) setSlug(paraSlug(v))
  }

  const aoSalvar = async (evt: React.FormEvent) => {
    evt.preventDefault()
    if (salvando) return

    setErro(null)
    setSalvando(true)

    try {
      const evento = await criarEvento({
        slug,
        titulo: valores.titulo,
        descricao: valores.descricao || null,
        dataEvento: valores.dataEvento || null,
        corDestaque: valores.corDestaque || null,
        layout: valores.layout,
      })
      navegar(`/admin/eventos/${evento.id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui criar o evento.')
      setSalvando(false)
    }
  }

  return (
    <main className="lados-seguros topo-seguro mx-auto w-full max-w-2xl py-10 sm:py-14">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Todos os eventos
      </Link>

      <h1 className="font-heading mt-4 text-3xl text-champanhe-claro">Novo evento</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ele nasce como rascunho — publique quando as fotos estiverem prontas.
      </p>

      <form onSubmit={(evt) => void aoSalvar(evt)} className="mt-8 flex flex-col gap-5">
        <CamposEvento
          valores={valores}
          aoMudarTitulo={aoMudarTitulo}
          aoMudarDescricao={(v) => setValores((a) => ({ ...a, descricao: v }))}
          aoMudarData={(v) => setValores((a) => ({ ...a, dataEvento: v }))}
          aoMudarCor={(v) => setValores((a) => ({ ...a, corDestaque: v }))}
          aoMudarLayout={(v) => setValores((a) => ({ ...a, layout: v }))}
          desabilitado={salvando}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="campo-slug" className="text-sm font-medium text-foreground">
            Endereço
          </label>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-sm text-muted-foreground">/e/</span>
            <Input
              id="campo-slug"
              value={slug}
              onChange={(evt) => {
                setSlugTocado(true)
                setSlug(paraSlug(evt.target.value))
              }}
              disabled={salvando}
              placeholder="culto-de-jovens-2026"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Precisa ser IGUAL ao nome da pasta que for para o{' '}
            <code className="rounded bg-muted px-1 py-0.5">npm run publicar</code> — é assim
            que o script encontra este evento em vez de criar um segundo.
          </p>
        </div>

        {erro && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={salvando || !valores.titulo.trim() || !slug}>
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Criando…
              </>
            ) : (
              'Criar evento'
            )}
          </Button>
        </div>
      </form>
    </main>
  )
}

import * as React from 'react'
import { Link } from 'react-router'
import { Loader2, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FormularioLogin } from '@/components/admin/FormularioLogin'
import { Marca } from '@/components/Marca'

type Estado = 'verificando' | 'autenticado' | 'nao-autenticado'

/**
 * Porta de entrada de TODA tela de `/admin`.
 *
 * Confere a sessao contra `GET /api/admin/sessao` — a mesma rota que o
 * middleware ja protege, entao chegar a uma resposta 200 e a prova de que a
 * sessao e valida — e mostra o formulario de login quando nao ha uma.
 *
 * Fica num componente so, envolvendo as tres rotas em `App.tsx`, para o
 * controle de sessao (e o botao de sair) nao se espalharem por cada pagina.
 */
export function ProtegerAdmin({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<Estado>('verificando')

  React.useEffect(() => {
    let cancelado = false

    fetch('/api/admin/sessao')
      .then((r) => {
        if (!cancelado) setEstado(r.ok ? 'autenticado' : 'nao-autenticado')
      })
      .catch(() => {
        if (!cancelado) setEstado('nao-autenticado')
      })

    return () => {
      cancelado = true
    }
  }, [])

  const aoSair = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {})
    setEstado('nao-autenticado')
  }

  if (estado === 'verificando') {
    return (
      <main className="flex min-h-svh w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </main>
    )
  }

  if (estado === 'nao-autenticado') {
    return <FormularioLogin aoEntrar={() => setEstado('autenticado')} />
  }

  return (
    <div>
      {/* A barra do painel: o mesmo ceu e o mesmo logo do site, para o admin nao parecer outro produto. */}
      <header className="ceu-barra border-b border-white/15">
        <div className="lados-seguros topo-seguro mx-auto flex min-h-[76px] max-w-6xl items-center justify-between gap-4">
          <Link
            to="/admin"
            className="flex items-center gap-4 rounded-md outline-none focus-visible:ring-4 focus-visible:ring-ring"
          >
            <Marca className="w-[116px]" />
            <span className="hidden text-[17px] font-medium text-foreground/90 sm:inline">
              Painel de fotos
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">Ver o site</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void aoSair()}>
              <LogOut data-icon="inline-start" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

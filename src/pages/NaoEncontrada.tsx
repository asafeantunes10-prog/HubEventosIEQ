import { Link } from 'react-router'
import { ChevronLeft, Signpost } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Rota coringa (`path="*"` em `App.tsx`): o que aparece quando o endereco nao
 * bate com NENHUMA rota do app — link digitado errado, um `/` a mais colado
 * do Instagram, um bot tateando caminhos aleatorios.
 *
 * Antes desta tela o resultado era uma PAGINA EM BRANCO: o Cloudflare Pages
 * devolve `index.html` (sem isso o proprio roteamento client-side de
 * `/e/:slug` e `/admin/...` quebraria em qualquer recarregamento direto), o
 * React monta, mas nenhum `<Route>` casa com o caminho e `<Routes>` nao
 * renderiza nada. A pessoa via um branco sem explicacao — o mesmo problema
 * que `LimiteDeErro.tsx` resolve para erro de renderizacao, so que para
 * endereco invalido.
 *
 * O STATUS HTTP tambem vira 404 de verdade — `functions/_middleware.ts` troca
 * o status da resposta quando o caminho nao bate com nenhuma rota conhecida.
 * O corpo continua sendo a mesma casca do SPA (por isso esta tela ainda
 * aparece certinho); so um bot ou uma ferramenta de SEO enxerga a diferenca.
 */
export function NaoEncontrada() {
  return (
    <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Signpost className="size-6 text-muted-foreground" aria-hidden />
      </div>

      <h1 className="font-heading mt-6 text-2xl tracking-tight text-champanhe-claro">
        Este endereço não existe
      </h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Confira se o link foi colado certinho. Se veio do Instagram ou do WhatsApp, pode
        ter faltado um pedaço.
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

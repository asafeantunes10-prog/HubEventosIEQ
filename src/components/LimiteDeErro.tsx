import * as React from 'react'
import { House, RotateCcw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = { children: React.ReactNode }
type Estado = { erro: Error | null }

/**
 * Rede de seguranca para erros de renderizacao.
 *
 * Sem isto, um unico erro em qualquer componente desmonta a arvore inteira do
 * React e quem abriu o link fica olhando uma PAGINA EM BRANCO — sem mensagem,
 * sem botao, sem pista do que fazer. A pessoa nao vai reportar o problema: vai
 * fechar a aba e concluir que o site da igreja nao funciona.
 *
 * Com o limite, o erro fica contido numa tela que ainda parece o site, explica
 * em portugues o que houve e oferece duas saidas obvias: tentar de novo ou
 * voltar para a lista de eventos.
 *
 * Precisa ser classe: `componentDidCatch` nao tem equivalente em hook.
 */
export class LimiteDeErro extends React.Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    // Fica no console para quem desenvolve; o visitante ve a tela amigavel.
    console.error('Erro nao tratado na interface:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="mx-auto flex min-h-[70svh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
        </div>

        <h1 className="font-heading mt-6 text-2xl tracking-tight text-champanhe-claro">
          Alguma coisa saiu do lugar
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          O site tropeçou ao montar esta tela. Não foi culpa sua, e nenhuma foto foi
          perdida.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Button size="lg" onClick={() => window.location.reload()}>
            <RotateCcw data-icon="inline-start" />
            Tentar de novo
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/">
              <House data-icon="inline-start" />
              Ver todos os eventos
            </a>
          </Button>
        </div>

        {/* Detalhe tecnico so em desenvolvimento — o visitante nao precisa ver isto. */}
        {import.meta.env.DEV && (
          <pre className="mt-8 max-w-full overflow-x-auto rounded-lg bg-muted p-4 text-left text-xs text-muted-foreground">
            {this.state.erro.message}
          </pre>
        )}
      </div>
    )
  }
}

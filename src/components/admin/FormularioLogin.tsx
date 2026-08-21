import * as React from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = { aoEntrar: () => void }

/**
 * A porta de entrada do painel: uma senha unica, sem usuario.
 *
 * Substitui o Cloudflare Access, que exigiria cartao de credito mesmo no
 * plano gratuito da equipe (ver `functions/api/admin/_middleware.ts`). Sem
 * contas por pessoa, so uma senha compartilhada — suficiente para o tamanho
 * da equipe deste projeto.
 */
export function FormularioLogin({ aoEntrar }: Props) {
  const [senha, setSenha] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const aoSubmeter = async (evt: React.FormEvent) => {
    evt.preventDefault()
    if (enviando || !senha) return

    setEnviando(true)
    setErro(null)

    try {
      const resposta = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ senha }),
      })

      if (!resposta.ok) {
        const corpo: unknown = await resposta.json().catch(() => null)
        const mensagem =
          corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string'
            ? corpo.erro
            : 'Não consegui entrar.'
        setErro(mensagem)
        return
      }

      aoEntrar()
    } catch {
      setErro('Não consegui falar com o servidor agora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4">
      <h1 className="font-heading text-2xl text-champanhe-claro">Painel administrativo</h1>
      <p className="mt-2 text-sm text-muted-foreground">Entre com a senha do painel.</p>

      <form onSubmit={(evt) => void aoSubmeter(evt)} className="mt-6 flex flex-col gap-4">
        <Input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          autoFocus
          disabled={enviando}
        />

        {erro && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {erro}
          </div>
        )}

        <Button type="submit" disabled={enviando || !senha}>
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}

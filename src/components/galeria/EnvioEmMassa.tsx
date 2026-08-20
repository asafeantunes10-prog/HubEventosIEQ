import * as React from 'react'
import { Check, ImagePlus, Loader2, TriangleAlert, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Envio em massa por arrastar e soltar.
 *
 * CONCORRENCIA DE 3 — o numero mais importante deste arquivo.
 *
 * Cada foto passa por decodificacao, tres redimensionamentos e tres
 * codificacoes WebP (ver `fotos.ts`) antes de subir. Fazer isso com 200 fotos
 * ao mesmo tempo trava a aba: sao 200 bitmaps disputando memoria. Sequencial
 * resolveria a memoria, mas deixaria a rede parada durante todo o processamento
 * e a CPU parada durante todo o upload.
 *
 * Tres e o meio-termo: sempre ha uma foto sendo processada enquanto outra sobe,
 * e o pico de memoria fica em torno de tres imagens.
 *
 * QUEM ENVIA E DECIDIDO POR QUEM CHAMA. O componente recebe `aoEnviarArquivo` e
 * nao sabe nada sobre a Function de upload, o R2 nem o D1 — e o que permite
 * testa-lo sem rede e reaproveita-lo se o destino mudar.
 */

const CONCORRENCIA = 3

type Estado = 'esperando' | 'preparando' | 'enviando' | 'pronto' | 'erro'

type Item = {
  arquivo: File
  estado: Estado
  erro?: string
}

type Props = {
  /**
   * Processa e sobe UM arquivo. Recebe a posicao final na galeria e um relato
   * de etapa, para a lista mostrar em que pe cada foto esta.
   */
  aoEnviarArquivo: (
    arquivo: File,
    ordem: number,
    aoMudarEtapa: (etapa: 'preparando' | 'enviando') => void
  ) => Promise<void>
  /** Maior `ordem` ja usada, para as novas fotos entrarem no fim da lista. */
  ordemInicial: number
  aoConcluir: (enviadas: number) => void
}

export function EnvioEmMassa({ aoEnviarArquivo, ordemInicial, aoConcluir }: Props) {
  const [itens, setItens] = React.useState<Item[]>([])
  const [enviando, setEnviando] = React.useState(false)
  const [arrastando, setArrastando] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const adicionar = (lista: FileList | null) => {
    if (!lista) return

    const novos = Array.from(lista)
      .filter((f) => f.type.startsWith('image/'))
      .map((arquivo): Item => ({ arquivo, estado: 'esperando' }))

    setItens((atuais) => [...atuais, ...novos])
  }

  const atualizar = (indice: number, mudanca: Partial<Item>) => {
    setItens((atuais) => atuais.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)))
  }

  const enviar = async () => {
    if (enviando || itens.length === 0) return

    setEnviando(true)
    let enviadas = 0

    /*
      Fila compartilhada por indice: cada "trabalhador" pega o proximo numero
      livre e o processa. E o jeito mais simples de manter exatamente
      CONCORRENCIA fotos em andamento sem lotes — com lotes de 3, uma foto de
      40 MP no meio do lote deixaria os outros dois trabalhadores ociosos ate
      ela terminar.
    */
    let proximo = 0

    const trabalhar = async () => {
      for (;;) {
        const indice = proximo++
        if (indice >= itens.length) return

        const item = itens[indice]
        if (item.estado === 'pronto') continue

        try {
          await aoEnviarArquivo(item.arquivo, ordemInicial + indice, (etapa) =>
            atualizar(indice, { estado: etapa })
          )
          enviadas++
          atualizar(indice, { estado: 'pronto' })
        } catch (e) {
          /*
            Um arquivo com problema nao derruba os outros. Enviar 500 fotos e
            perder tudo por causa de um JPEG corrompido no meio seria o pior
            resultado possivel — quem enviou teria que recomecar sem saber qual
            arquivo culpar.
          */
          atualizar(indice, {
            estado: 'erro',
            erro: e instanceof Error ? e.message : 'Erro desconhecido.',
          })
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, trabalhar))

    setEnviando(false)
    aoConcluir(enviadas)

    // Tira da lista o que deu certo; o que falhou fica na tela, com o motivo,
    // para quem enviou decidir se tenta de novo ou remove.
    setItens((atuais) => atuais.filter((item) => item.estado === 'erro'))
  }

  const prontas = itens.filter((i) => i.estado === 'pronto').length
  const comErro = itens.filter((i) => i.estado === 'erro').length

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          adicionar(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          arrastando ? 'border-primary bg-primary/5' : 'border-border'
        )}
      >
        <ImagePlus className="mx-auto size-8 text-muted-foreground/40" aria-hidden />

        <p className="mt-4 text-sm text-foreground">
          Arraste as fotos aqui ou{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-primary underline-offset-4 hover:underline"
          >
            escolha do computador
          </button>
        </p>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          JPG, PNG, WebP ou AVIF. As três versões de cada foto são geradas aqui no seu
          navegador — para muitas fotos de uma vez, use o <code>npm run publicar</code>.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            adicionar(e.target.files)
            // Zera para permitir escolher o MESMO arquivo de novo depois de
            // remove-lo da lista; sem isto o `change` nao dispara.
            e.target.value = ''
          }}
        />
      </div>

      {itens.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {itens.length} {itens.length === 1 ? 'arquivo' : 'arquivos'}
              {prontas > 0 && ` · ${prontas} enviados`}
              {comErro > 0 && <span className="text-destructive"> · {comErro} com erro</span>}
            </p>

            <div className="flex gap-2">
              {!enviando && (
                <Button variant="ghost" size="sm" onClick={() => setItens([])}>
                  Limpar
                </Button>
              )}
              <Button size="sm" onClick={() => void enviar()} disabled={enviando}>
                {enviando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" aria-hidden />
                    Enviar {itens.length}
                  </>
                )}
              </Button>
            </div>
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {itens.map((item, i) => (
              <li
                key={`${item.arquivo.name}-${i}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="shrink-0">
                  {item.estado === 'pronto' && <Check className="size-4 text-primary" aria-hidden />}
                  {item.estado === 'erro' && (
                    <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  )}
                  {(item.estado === 'preparando' || item.estado === 'enviando') && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                  )}
                  {item.estado === 'esperando' && (
                    <span className="block size-4 rounded-full border border-border" aria-hidden />
                  )}
                </span>

                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.arquivo.name}
                </span>

                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {item.estado === 'preparando' && 'preparando'}
                  {item.estado === 'enviando' && 'enviando'}
                  {item.estado === 'erro' && item.erro}
                  {item.estado === 'esperando' &&
                    `${(item.arquivo.size / 1024 / 1024).toFixed(1)} MB`}
                </span>

                {!enviando && item.estado !== 'pronto' && (
                  <button
                    type="button"
                    onClick={() => setItens((atuais) => atuais.filter((_, j) => j !== i))}
                    aria-label={`Remover ${item.arquivo.name}`}
                    className="shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

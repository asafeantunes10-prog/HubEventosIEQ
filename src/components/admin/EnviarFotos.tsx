import * as React from 'react'
import {
  Check,
  CircleAlert,
  Clock,
  FolderUp,
  ImagePlus,
  Loader2,
  TriangleAlert,
  Upload,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { estadoDoArmazenamento, type EstadoArmazenamento, type FotoAdmin } from '@/lib/apiAdmin'
import { ACCEPT_DO_SELETOR } from '@/lib/envio/formatos'
import { faltaParaEnviar, MENSAGEM_NAVEGADOR_ANTIGO } from '@/lib/envio/suporte'
import {
  EnvioDeFotos,
  type ItemDeEnvio,
  type SituacaoItem,
} from '@/lib/envio/envio'
import { cn } from '@/lib/utils'

type Props = {
  eventoId: string
  /** As fotos que o evento ja tem — para pular o que ja foi enviado antes. */
  fotosAtuais: FotoAdmin[]
  /** Chamado quando um envio termina (ou e cancelado), para a tela recarregar a lista. */
  aoTerminar: () => void
}

/**
 * Envio de fotos pelo navegador: a pessoa escolhe fotos ou uma pasta (JPEG, PNG,
 * WebP ou RAW) e o painel faz o resto — prepara, manda, grava e publica.
 *
 * Mostra TODO arquivo escolhido com o que aconteceu a ele. O envio antigo, por
 * script, descartava em silencio o que nao reconhecia; aqui nada some, e o que
 * deu errado diz por que.
 */
export function EnviarFotos({ eventoId, fotosAtuais, aoTerminar }: Props) {
  // Uma instancia por evento aberto; ela mesma lembra o que ja registrou.
  const [envio] = React.useState(
    () =>
      new EnvioDeFotos(
        eventoId,
        fotosAtuais.flatMap((f) => (f.chaveOrigem ? [f.chaveOrigem] : [])),
        fotosAtuais.some((f) => f.situacao !== 'no-ar')
      )
  )
  const estado = React.useSyncExternalStore(envio.assinar, envio.estado)

  const [armazenamento, setArmazenamento] = React.useState<
    EstadoArmazenamento | { erro: string } | null
  >(null)
  const [arrastando, setArrastando] = React.useState(false)
  const entradaDeArquivos = React.useRef<HTMLInputElement>(null)
  const entradaDePasta = React.useRef<HTMLInputElement>(null)

  const ocupado =
    estado.fase === 'preparando' || estado.fase === 'enviando' || estado.fase === 'publicando'

  const atualizarArmazenamento = React.useCallback(() => {
    estadoDoArmazenamento()
      .then(setArmazenamento)
      .catch((e: unknown) =>
        setArmazenamento({ erro: e instanceof Error ? e.message : 'Não consegui consultar o limite.' })
      )
  }, [])

  React.useEffect(() => {
    atualizarArmazenamento()
  }, [atualizarArmazenamento])

  // Quando um envio acaba, a tela de cima recarrega a lista de fotos e o limite.
  const faseAnterior = React.useRef(estado.fase)
  React.useEffect(() => {
    const terminou =
      (estado.fase === 'concluido' || estado.fase === 'cancelado') &&
      faseAnterior.current !== estado.fase
    faseAnterior.current = estado.fase
    if (terminou) {
      aoTerminar()
      atualizarArmazenamento()
    }
  }, [estado.fase, aoTerminar, atualizarArmazenamento])

  // Enquanto envia: mantem a tela acordada (um notebook que dorme no meio de 500
  // fotos interrompe tudo) e avisa antes de fechar a aba.
  React.useEffect(() => {
    if (!ocupado) return

    let sentinela: WakeLockSentinel | null = null
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        sentinela = s
      })
      .catch(() => {
        // Sem wake lock o envio continua; so nao ha garantia contra o sono da tela.
      })

    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)

    return () => {
      sentinela?.release().catch(() => {})
      window.removeEventListener('beforeunload', avisar)
    }
  }, [ocupado])

  const comecar = (arquivos: File[]) => {
    if (ocupado || bloqueado || arquivos.length === 0) return
    void envio.enviar(arquivos)
  }

  const aoSoltar = (evt: React.DragEvent) => {
    evt.preventDefault()
    setArrastando(false)
    if (ocupado || bloqueado) return
    // Precisa ser lido AGORA: depois do primeiro `await` a lista do arrastar esvazia.
    const promessa = arquivosDoArrastar(evt.dataTransfer)
    void promessa.then(comecar)
  }

  const aoEscolher = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(evt.target.files ?? [])
    // Permite escolher a mesma pasta de novo logo em seguida.
    evt.target.value = ''
    comecar(arquivos)
  }

  const naoConfigurado =
    armazenamento !== null && 'erro' in armazenamento && /configurad|CF_API_TOKEN/i.test(armazenamento.erro)

  // Calculado uma vez: o navegador nao muda no meio da tela.
  const [faltaNoNavegador] = React.useState(faltaParaEnviar)
  const navegadorNaoServe = faltaNoNavegador.length > 0
  const bloqueado = naoConfigurado || navegadorNaoServe

  const comErro = estado.itens.filter((i) => i.situacao === 'erro')
  const feitos = estado.itens.filter((i) => FINAIS.has(i.situacao)).length
  const total = estado.itens.length
  const porcentagem = total === 0 ? 0 : Math.round((feitos / total) * 100)

  return (
    <div className="flex flex-col gap-4">
      {naoConfigurado && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O envio de fotos ainda não foi configurado no servidor (faltam o token e o ID da conta da
            Cloudflare). Veja o README, seção “Configurar o envio de fotos”.
          </span>
        </div>
      )}

      {navegadorNaoServe && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {MENSAGEM_NAVEGADOR_ANTIGO} (Falta: {faltaNoNavegador.join(', ')}.)
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!ocupado && !bloqueado) setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
        className={cn(
          'flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors',
          arrastando && 'border-primary bg-primary/5',
          (ocupado || bloqueado) && 'opacity-60'
        )}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">
            Arraste fotos ou uma pasta inteira para cá
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP e RAW (Sony ARW, Canon CR3/CR2 e outros). O arquivo grande fica no seu
            computador: só a versão leve sobe.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={ocupado || bloqueado}
            onClick={() => entradaDeArquivos.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            Escolher fotos
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={ocupado || bloqueado}
            onClick={() => entradaDePasta.current?.click()}
          >
            <FolderUp className="size-4" aria-hidden />
            Escolher uma pasta
          </Button>
        </div>

        <input
          ref={entradaDeArquivos}
          type="file"
          multiple
          accept={ACCEPT_DO_SELETOR}
          className="hidden"
          onChange={aoEscolher}
        />
        <input
          ref={entradaDePasta}
          type="file"
          multiple
          // `webkitdirectory` e o nome (nao padronizado, mas universal) do seletor de pasta.
          {...{ webkitdirectory: '' }}
          className="hidden"
          onChange={aoEscolher}
        />
      </div>

      {armazenamento && !('erro' in armazenamento) && (
        <LimiteDeArquivos estado={armazenamento} />
      )}

      {(total > 0 || estado.descartados.length > 0 || estado.mensagem) && (
        <Andamento
          fase={estado.fase}
          total={total}
          feitos={feitos}
          porcentagem={porcentagem}
          erros={comErro.length}
          bytesEnviados={estado.bytesEnviados}
          ignorados={estado.ignorados}
          mensagem={estado.mensagem}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {ocupado && estado.fase !== 'publicando' && (
          <Button type="button" variant="outline" onClick={() => envio.cancelar()}>
            Cancelar envio
          </Button>
        )}
        {!ocupado && comErro.length > 0 && (
          <Button type="button" onClick={() => comecar(envio.arquivosComErro())}>
            Tentar de novo ({comErro.length})
          </Button>
        )}
        {!ocupado && estado.haPendentes && (
          <Button type="button" variant="secondary" onClick={() => void envio.publicarAgora()}>
            Publicar agora
          </Button>
        )}
      </div>

      {estado.descartados.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
          <li className="font-medium text-foreground">
            Arquivos que não são fotos aceitas ({estado.descartados.length})
          </li>
          {estado.descartados.slice(0, 20).map((d, i) => (
            <li key={`${d.nome}-${i}`} className="text-muted-foreground">
              <span className="text-foreground">{d.nome}</span> — {d.motivo}
            </li>
          ))}
          {estado.descartados.length > 20 && (
            <li className="text-muted-foreground">e mais {estado.descartados.length - 20}…</li>
          )}
        </ul>
      )}

      {total > 0 && <ListaDeItens itens={estado.itens} />}
    </div>
  )
}

/** Estados em que a foto nao precisa de mais nada para esta rodada. */
const FINAIS = new Set<SituacaoItem>(['registrada', 'no-ar', 'erro', 'ja-enviada'])

const ROTULOS: Record<SituacaoItem, string> = {
  'na-fila': 'Na fila',
  processando: 'Preparando…',
  pronta: 'Pronta',
  enviando: 'Enviando…',
  enviada: 'Enviada',
  registrada: 'Guardada',
  'no-ar': 'No ar',
  erro: 'Erro',
  'ja-enviada': 'Já enviada antes',
}

function formatarBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function LimiteDeArquivos({ estado }: { estado: EstadoArmazenamento }) {
  const parte = Math.min(100, Math.round((estado.arquivos / estado.limite) * 100))
  const apertado = parte >= 90

  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex justify-between">
        <span>Espaço do site</span>
        <span className={cn(apertado && 'font-medium text-destructive')}>
          {estado.arquivos.toLocaleString('pt-BR')} de {estado.limite.toLocaleString('pt-BR')} arquivos
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full bg-primary', apertado && 'bg-destructive')}
          style={{ width: `${parte}%` }}
        />
      </div>
      {apertado && (
        <p className="mt-1 text-destructive">
          Quase cheio. Arquive eventos antigos para liberar espaço.
        </p>
      )}
    </div>
  )
}

function Andamento({
  fase,
  total,
  feitos,
  porcentagem,
  erros,
  bytesEnviados,
  ignorados,
  mensagem,
}: {
  fase: string
  total: number
  feitos: number
  porcentagem: number
  erros: number
  bytesEnviados: number
  ignorados: number
  mensagem: string | null
}) {
  const titulo =
    fase === 'preparando'
      ? 'Lendo os arquivos…'
      : fase === 'enviando'
        ? `Enviando… ${feitos} de ${total}`
        : fase === 'publicando'
          ? 'Publicando no site… (leva alguns segundos)'
          : fase === 'cancelado'
            ? 'Envio cancelado'
            : erros > 0
              ? `Terminou, mas ${erros} ${erros === 1 ? 'arquivo deu' : 'arquivos deram'} erro`
              : total > 0
                ? 'Tudo no ar'
                : ''

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {fase === 'preparando' || fase === 'enviando' || fase === 'publicando' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : erros > 0 || fase === 'cancelado' ? (
          <CircleAlert className="size-4 text-destructive" aria-hidden />
        ) : total > 0 ? (
          <Check className="size-4 text-primary" aria-hidden />
        ) : null}
        {titulo}
      </div>

      {total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${porcentagem}%` }}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {bytesEnviados > 0 && `${formatarBytes(bytesEnviados)} enviados`}
        {ignorados > 0 &&
          `${bytesEnviados > 0 ? ' · ' : ''}${ignorados} arquivos de apoio (.xmp e semelhantes) ignorados`}
      </p>

      {mensagem && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {mensagem}
        </div>
      )}
    </div>
  )
}

function ListaDeItens({ itens }: { itens: ItemDeEnvio[] }) {
  // Os com problema sobem para o topo: e o que a pessoa precisa ver primeiro.
  const ordenados = React.useMemo(
    () => [...itens].sort((a, b) => Number(b.situacao === 'erro') - Number(a.situacao === 'erro')),
    [itens]
  )

  return (
    <ul className="max-h-80 overflow-y-auto rounded-lg border border-border text-sm">
      {ordenados.map((item) => (
        <li
          key={item.chave}
          className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="truncate text-foreground">
              {item.nome}
              {item.tipo === 'raw' && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                  RAW
                </span>
              )}
            </p>
            {item.erro && <p className="text-xs text-destructive">{item.erro}</p>}
            {item.avisos.map((aviso) => (
              <p key={aviso} className="text-xs text-muted-foreground">
                {aviso}
              </p>
            ))}
          </div>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 text-xs',
              item.situacao === 'erro' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {item.situacao === 'no-ar' && <Check className="size-3.5 text-primary" aria-hidden />}
            {item.situacao === 'na-fila' && <Clock className="size-3.5" aria-hidden />}
            {(item.situacao === 'processando' || item.situacao === 'enviando') && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            )}
            {ROTULOS[item.situacao]}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Os arquivos de um arrastar-e-soltar, entrando nas pastas.
 *
 * `webkitGetAsEntry` e a unica forma de o navegador entregar o CONTEUDO de uma
 * pasta arrastada (so `dataTransfer.files` traria a pasta como um item vazio).
 */
async function arquivosDoArrastar(dt: DataTransfer): Promise<File[]> {
  // Tem de ser lido antes de qualquer `await`: depois dele o navegador esvazia a lista.
  const entradas = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null)

  if (entradas.length === 0) return Array.from(dt.files)

  const arquivos: File[] = []

  async function percorrer(entrada: FileSystemEntry): Promise<void> {
    if (entrada.isFile) {
      const arquivo = await new Promise<File>((ok, falha) =>
        (entrada as FileSystemFileEntry).file(ok, falha)
      )
      arquivos.push(arquivo)
      return
    }

    if (entrada.isDirectory) {
      const leitor = (entrada as FileSystemDirectoryEntry).createReader()
      // `readEntries` devolve em pedacos (cerca de 100); repete ate vir vazio.
      for (;;) {
        const lote = await new Promise<FileSystemEntry[]>((ok) =>
          leitor.readEntries(ok, () => ok([]))
        )
        if (lote.length === 0) break
        for (const filho of lote) await percorrer(filho)
      }
    }
  }

  for (const entrada of entradas) await percorrer(entrada)
  return arquivos
}

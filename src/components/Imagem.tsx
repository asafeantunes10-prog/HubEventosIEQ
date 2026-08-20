import * as React from 'react'
import { ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  src: string
  alt: string
  /** Larguras alternativas geradas por `npm run fotos`. */
  srcSet?: string
  /**
   * Quanto da largura da tela a imagem ocupa em cada faixa. SEM isto o navegador
   * assume 100vw e baixa a maior versao mesmo num cartao estreito — o `srcSet`
   * vira enfeite. Exemplo: "(min-width: 1024px) 40vw, 82vw".
   */
  sizes?: string
  /** Dimensoes do original: reservam o espaco e impedem a pagina de pular. */
  largura?: number
  altura?: number
  /** Miniatura borrada em base64, exibida ate a foto real pintar. */
  lqip?: string
  className?: string
  /** Texto de apoio mostrado quando o arquivo de imagem nao existe. */
  rotulo?: string
  loading?: 'lazy' | 'eager'
  /** `high` para a imagem principal da tela inicial; o resto pode esperar. */
  prioridade?: boolean
}

/**
 * Imagem com carregamento progressivo.
 *
 * Tres problemas que ela resolve de uma vez:
 *
 * 1. PULO DE LAYOUT — sem `width`/`height` o navegador nao sabe o tamanho antes
 *    do download e o texto abaixo salta quando a foto chega. Em celular isso faz
 *    o dedo clicar no lugar errado.
 * 2. RETANGULO CINZA — enquanto a foto baixa, aparece o LQIP borrado no lugar do
 *    vazio. A transicao de borrado para nitido le como "carregou rapido" mesmo
 *    quando a rede esta ruim.
 * 3. IMAGEM QUEBRADA — se o arquivo nao existe, cai num espaco reservado com a
 *    cara do site em vez do icone de imagem partida do navegador.
 */
export function Imagem({
  src,
  alt,
  srcSet,
  sizes,
  largura,
  altura,
  lqip,
  className,
  rotulo,
  loading = 'lazy',
  prioridade = false,
}: Props) {
  const [estado, setEstado] = React.useState<'carregando' | 'pronta' | 'falhou'>('carregando')
  const ref = React.useRef<HTMLImageElement>(null)

  // Se o caminho mudar, vale a pena tentar carregar de novo.
  React.useEffect(() => {
    setEstado('carregando')
  }, [src])

  /*
    Imagem em cache pinta antes do React pendurar o onLoad, e o evento nunca
    chega — a foto ficaria invisivel para sempre. `complete` cobre esse caso.
  */
  React.useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) setEstado('pronta')
  }, [src])

  if (estado === 'falhou') {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center',
          className
        )}
      >
        <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden />
        <p className="text-xs tracking-wide text-muted-foreground/70 uppercase">
          {rotulo ?? 'Espaço reservado para a foto'}
        </p>
        <code className="rounded bg-background/70 px-2 py-1 text-[0.7rem] text-muted-foreground">
          {src}
        </code>
      </div>
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden bg-muted', className)}
      style={
        lqip
          ? {
              backgroundImage: `url("${lqip}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <img
        ref={ref}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={largura}
        height={altura}
        loading={prioridade ? 'eager' : loading}
        // `async` tira a decodificacao da thread principal: a rolagem nao trava.
        decoding="async"
        fetchPriority={prioridade ? 'high' : 'auto'}
        onLoad={() => setEstado('pronta')}
        onError={() => setEstado('falhou')}
        className={cn(
          'size-full object-cover transition-opacity duration-700 ease-out',
          estado === 'pronta' ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}

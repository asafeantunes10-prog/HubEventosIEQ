import { Imagem } from '@/components/Imagem'
import { urlFoto } from '@/lib/fotos'
import { cn } from '@/lib/utils'
import type { Foto } from '@/lib/tipos'

type Capa = Pick<Foto, 'caminho' | 'lqip' | 'largura' | 'altura'>

type Props = {
  capa: Capa
  /** Num evento arquivado a versao grande saiu do ar; a miniatura e a que sobra. */
  arquivado: boolean
  vertical: boolean
}

/**
 * A foto de capa dentro do cabecalho de um evento (home e pagina do evento).
 *
 * No celular ela sempre preenche o cartao; no computador, se for vertical, fica
 * num painel a direita e se dissolve para a esquerda (a mascara), deixando o
 * ceu aparecer atras do titulo.
 */
export function CapaEvento({ capa, arquivado, vertical }: Props) {
  return (
    <Imagem
      src={urlFoto(capa.caminho, arquivado ? 't' : 'g')}
      alt=""
      lqip={capa.lqip ?? undefined}
      largura={capa.largura ?? undefined}
      altura={capa.altura ?? undefined}
      posicao={vertical ? '50% 22%' : '50% 28%'}
      prioridade
      className={cn(
        'absolute inset-0 size-full',
        vertical && 'md:left-auto md:w-[46%] md:[mask-image:linear-gradient(to_right,transparent,#000_30%)]'
      )}
    />
  )
}

import logoBranco from '@/assets/identidade/logo-branco.webp'
import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /**
   * `true` quando o logo e so enfeite (ex.: repetido no rodape, ao lado de um
   * texto que ja diz o mesmo): leitor de tela nao precisa anunciar duas vezes.
   */
  decorativo?: boolean
}

/**
 * O logo "Avante & Sem Parar", em branco — o site inteiro e escuro, entao so
 * esta versao e usada. As dimensoes do arquivo (900x323) reservam o espaco e
 * evitam que o texto abaixo pule quando a imagem chega.
 *
 * A largura sai de `className` (`w-56`, `w-[116px]`...): o logo aparece em
 * tamanhos bem diferentes entre o hero do celular e a barra do painel.
 */
export function Marca({ className, decorativo = false }: Props) {
  return (
    <img
      src={logoBranco}
      alt={decorativo ? '' : 'Avante e sem parar'}
      width={900}
      height={323}
      className={cn('block h-auto', className)}
    />
  )
}

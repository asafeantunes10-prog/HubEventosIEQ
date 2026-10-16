import { Marca } from '@/components/Marca'

/**
 * O fecho das telas publicas, numa faixa mais escura que o resto (`.faixa-rodape`)
 * para marcar onde o conteudo acaba.
 *
 * No celular a igreja vem separada por uma linha, num bloco proprio; no
 * computador as duas partes ficam lado a lado.
 */
export function Rodape() {
  return (
    <footer className="faixa-rodape lados-amplos pt-9 pb-[max(2.25rem,env(safe-area-inset-bottom))] md:pt-12 md:pb-[max(3.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[1328px] flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-12">
        <div className="flex flex-col gap-4">
          <Marca decorativo className="w-[150px] md:w-[180px]" />
          <p className="max-w-[36ch] text-base leading-relaxed text-muted-foreground md:max-w-[46ch] md:text-lg">
            Fotos de todos os eventos da igreja. É só clicar para baixar e compartilhar nas suas
            redes sociais.
          </p>
        </div>

        <p className="border-t border-white/10 pt-5 text-[15px] text-muted-foreground md:border-t-0 md:pt-0 md:text-base">
          Igreja do Evangelho Quadrangular
        </p>
      </div>
    </footer>
  )
}

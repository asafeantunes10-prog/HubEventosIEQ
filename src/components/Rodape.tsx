import { Marca } from '@/components/Marca'

/**
 * O fecho das telas publicas: repete a promessa do site (sem conta, sem senha,
 * sem link que expira) para quem chegou ate o fim da rolagem — e quem rola
 * ate aqui costuma estar decidindo se pode compartilhar o link com outra
 * pessoa.
 */
export function Rodape() {
  return (
    <footer className="lados-amplos pt-10 pb-[max(2.25rem,env(safe-area-inset-bottom))] md:pt-12 md:pb-[max(4.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[1328px] flex-wrap items-end justify-between gap-x-12 gap-y-6">
        <div className="flex flex-col gap-4">
          <Marca decorativo className="w-[150px] md:w-[180px]" />
          <p className="max-w-[36ch] text-base leading-relaxed text-muted-foreground md:max-w-[46ch] md:text-lg">
            Fotos de todos os eventos da igreja. É só clicar para baixar e compartilhar nas suas
            redes sociais.
          </p>
        </div>

        <p className="text-[15px] text-muted-foreground md:text-base">
          Igreja do Evangelho Quadrangular
        </p>
      </div>
    </footer>
  )
}

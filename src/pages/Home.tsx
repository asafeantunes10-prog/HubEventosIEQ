import { Camera } from 'lucide-react'

/**
 * A capa do site.
 *
 * Nesta etapa ela existe para uma coisa so: provar que a fundacao esta de pe —
 * as fontes carregam, os tokens de cor valem, o Tailwind compila. A grade de
 * eventos entra na etapa 2, quando houver banco de onde le-los.
 */
export function Home() {
  return (
    <main className="lados-seguros topo-seguro mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center py-20">
      <span className="rotulo-seccao">Igreja do Evangelho Quadrangular</span>

      <h1 className="titulo-metal font-heading mt-4 text-4xl tracking-tight sm:text-6xl">
        Fotos dos eventos
      </h1>

      <p className="mt-6 max-w-prose leading-relaxed text-muted-foreground">
        As fotos de cada evento da igreja, reunidas num lugar só. Sem conta, sem pedido de
        permissão, sem link que expira: é só abrir, ver e baixar o que você quiser.
      </p>

      <div className="superficie brilho-tema mt-12 flex items-center gap-4 rounded-xl p-5">
        <Camera className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Fundação no ar. A lista de eventos e as galerias entram na próxima etapa.
        </p>
      </div>
    </main>
  )
}

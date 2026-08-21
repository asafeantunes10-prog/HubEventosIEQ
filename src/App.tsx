import { BrowserRouter, Route, Routes } from 'react-router'

import { LimiteDeErro } from '@/components/LimiteDeErro'
import { Home } from '@/pages/Home'
import { Evento } from '@/pages/Evento'
import { PainelEventos } from '@/pages/admin/PainelEventos'
import { NovoEvento } from '@/pages/admin/NovoEvento'
import { EditarEvento } from '@/pages/admin/EditarEvento'

/**
 * O roteador do site.
 *
 * `/e/:slug` e o endereco que vai para o Instagram e para o WhatsApp: curto,
 * legivel e estavel. Ele nasce aqui e nao muda mais — link divulgado que quebra
 * e pior que link feio.
 *
 * O `LimiteDeErro` fica POR FORA das rotas de proposito: um erro em qualquer
 * tela cai numa pagina que ainda parece o site, em vez de deixar o visitante
 * olhando um branco sem explicacao.
 */
export function App() {
  return (
    <LimiteDeErro>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/e/:slug" element={<Evento />} />
          {/*
            O Cloudflare Access protege /admin* no EDGE, antes de qualquer uma
            destas paginas chegar a carregar — ver `functions/api/admin/_middleware.ts`
            para a protecao que vale de verdade, contra a API. Enquanto o Access
            nao existir, estas rotas ficam visiveis mas inuteis: toda chamada as
            Functions de admin volta 503.
          */}
          <Route path="/admin" element={<PainelEventos />} />
          <Route path="/admin/eventos/novo" element={<NovoEvento />} />
          <Route path="/admin/eventos/:id" element={<EditarEvento />} />
        </Routes>
      </BrowserRouter>
    </LimiteDeErro>
  )
}

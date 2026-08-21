import { BrowserRouter, Route, Routes } from 'react-router'

import { LimiteDeErro } from '@/components/LimiteDeErro'
import { ProtegerAdmin } from '@/components/admin/ProtegerAdmin'
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
            `ProtegerAdmin` pede a senha antes de mostrar qualquer coisa daqui
            para baixo. A protecao que vale de verdade e a mesma senha
            validada de novo no servidor, em `functions/api/admin/_middleware.ts`
            — sem ela, nenhuma chamada as Functions de admin funciona, e isto
            aqui sozinho so estaria escondendo o botao.
          */}
          <Route
            path="/admin"
            element={
              <ProtegerAdmin>
                <PainelEventos />
              </ProtegerAdmin>
            }
          />
          <Route
            path="/admin/eventos/novo"
            element={
              <ProtegerAdmin>
                <NovoEvento />
              </ProtegerAdmin>
            }
          />
          <Route
            path="/admin/eventos/:id"
            element={
              <ProtegerAdmin>
                <EditarEvento />
              </ProtegerAdmin>
            }
          />
        </Routes>
      </BrowserRouter>
    </LimiteDeErro>
  )
}

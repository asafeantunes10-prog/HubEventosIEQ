import { BrowserRouter, Route, Routes } from 'react-router'

import { LimiteDeErro } from '@/components/LimiteDeErro'
import { Home } from '@/pages/Home'
import { Evento } from '@/pages/Evento'

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
        </Routes>
      </BrowserRouter>
    </LimiteDeErro>
  )
}

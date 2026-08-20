# Hub de Fotos da Igreja — plano de ação

## Contexto

Hoje as fotos dos eventos da igreja vão para o Google Drive e o link é divulgado no
Instagram. Isso não funciona bem: o Drive pede conta, às vezes exige permissão, o link
expira, a visualização no celular é ruim e nada disso tem a cara da igreja.

A ideia é um **hub próprio de entrega de fotos**: uma página central que explica o que é
o site e lista os eventos, e uma página por evento com as fotos numa grade bonita, onde
qualquer pessoa entra pelo link, vê e baixa — sem conta, sem PIN, sem marca d'água.

A base técnica se **inspira** no projeto A.S. Fotografia (`c:\Projetos\LandingPageAS`),
que já tem galeria em mosaico, visualizador, download em ZIP no navegador, upload em
massa com compressão client-side, pipeline de imagens com `sharp` e um design system
completo. O que muda é o backend: sai Supabase/Vercel, entra **Cloudflare** — porque o
gargalo real de um site de fotos é banda, e a Cloudflare é a única que dá banda ilimitada
de graça.

**Decisões já tomadas com o Asafe:**

| Assunto | Decisão |
| --- | --- |
| Volume | 500+ fotos por evento |
| Acesso | Totalmente público — link aberto, sem PIN |
| Stack | Cloudflare (Pages + R2 + D1) |
| Upload | Os dois: script no PC para as levas grandes, painel web para ajustes |
| Download | Versão alta para web (~2048px), não o original da câmera |
| Login admin | Cloudflare Access com conta Google |
| Visual | Começa com o tema atual, troca a identidade depois |
| Domínio | **Não pode comprar agora** — precisa durar 1–2 anos de graça sem domínio |
| Vínculo | **Projeto 100% independente.** O A.S. Fotografia é só molde — ver a regra abaixo |

---

## Regra número um: este projeto é independente

São dois projetos separados, de donos diferentes e com vidas diferentes. O A.S.
Fotografia serve como **molde**, e só. Na etapa 1 os arquivos aproveitáveis são copiados
para cá; **a partir daí o vínculo está cortado** e a pasta `LandingPageAS` deixa de
existir para efeito deste projeto.

O que isso proíbe, explicitamente:

- **Nenhum `import` que saia da pasta.** Nada de `../LandingPageAS/...`, nada de alias do
  TypeScript ou do Vite apontando para fora, nada de `link:` ou `file:` no
  `package.json`, nada de symlink, nada de submódulo git.
- **Nenhuma referência de build** — o `vite.config.ts` e os `tsconfig` só enxergam
  `./src`, `./functions` e `./scripts` daqui.
- **Repositório git próprio**, criado do zero nesta pasta. Não é fork, não é branch, não
  compartilha histórico.
- **Contas e recursos próprios**: bucket R2, banco D1 e projeto Pages novos, com nomes
  próprios. Nada é reaproveitado da conta do site de fotografia.
- **Identidade própria**: os arquivos de marca do A.S. Fotografia (logo, `og.jpg`,
  favicon, `src/data/marca.ts`, telefone e e-mail no `index.html`, o JSON-LD) **não vêm
  junto**. O que se copia é o *sistema* de cores e tipografia, não a marca de ninguém.
- **Sem Google Analytics herdado** — o ID `G-3WTVFJZMZL` do projeto atual está no código
  fonte; se algum arquivo copiado o trouxer, apague.

Quando um arquivo for copiado, ele passa a ser **deste projeto**: pode ser editado,
renomeado ou jogado fora à vontade, sem olhar para trás. Melhorias feitas aqui não voltam
para lá, e mudanças lá não chegam aqui — é assim que tem que ser.

**Teste de independência** (roda no fim da etapa 1, e de novo no fim do projeto): renomeie
temporariamente `c:\Projetos\LandingPageAS` para `LandingPageAS_off`, rode
`npm ci && npm run build` aqui e confirme que passa. Depois desfaça o nome. Se quebrar,
sobrou um vínculo — encontre e corte.

---

## O problema do domínio, e como ele foi resolvido

Essa restrição é a que mais mexe na arquitetura, então vem primeiro.

O caminho normal para servir fotos do R2 é ligar um domínio próprio ao bucket. Sem
domínio sobra o endereço `r2.dev`, que a Cloudflare diz explicitamente ser só para
desenvolvimento: tem limite variável de requisições e devolve `429` quando aperta.
Divulgar isso no Instagram seria pedir para quebrar no pior momento.

**A saída:** servir as fotos por uma **Pages Function** com *binding* de R2, num caminho
tipo `/img/...` dentro do próprio site. A Function lê o objeto pela API interna de
binding — não passa pelo `r2.dev`, então o limite dele não se aplica. O teto passa a ser
o do plano gratuito de Functions: **100.000 requisições por dia**.

Para não desperdiçar esse teto:

- **`Cache-Control: public, max-age=31536000, immutable`** em toda foto. Cada arquivo tem
  nome único (UUID), então cachear para sempre é seguro. Quem volta na galeria não gasta
  nenhuma requisição.
- **Cache API no edge** dentro da Function: a Cloudflare guarda a resposta no ponto de
  presença mais próximo e para de ler o R2 a cada acesso.
- **Paginação de 60 fotos** por vez na grade, em vez de despejar 500.

Dimensionando: uma visita a uma galeria custa ~62 requisições (1 do HTML, 1 da lista, 60
de miniaturas). São **~1.600 aberturas de galeria por dia** dentro do plano grátis. Uma
igreja não chega perto disso.

### O risco honesto: o ZIP

Baixar tudo em ZIP consome **1 requisição por foto** — um ZIP de 500 fotos gasta 500 de
uma vez. O teto vira ~200 downloads completos por dia. É bastante, mas é o número que
pode apertar num evento muito concorrido.

Por isso o código nasce com uma **chave de troca**: a variável `BASE_FOTOS` decide de
onde as fotos são servidas, e mudar de estratégia é mudar uma linha, não reescrever nada.

| Valor | Como serve | Quando usar |
| --- | --- | --- |
| `function` (padrão) | Pages Function `/img/*` | Começo. 100k req/dia, cache no edge |
| `r2dev` | URL pública `r2.dev` do bucket | Se a quota apertar. Não gasta Function, mas é limitado por rajada |
| `dominio` | Domínio próprio ligado ao R2 | O ideal. **Requisições e banda ilimitadas** |

**Gatilhos para pegar um domínio** (deixar anotado, não é urgente):

1. O painel de uso da Cloudflare mostrar mais de ~60% das requisições diárias em uso.
2. Alguém relatar foto que não carrega em dia de pico.

Duas opções quando chegar a hora: um `.com.br` no registro.br (~R$40/ano, resolve na
hora) ou um domínio gratuito e permanente do **eu.org**, que aceita os nameservers da
Cloudflare — grátis, mas a aprovação é manual e pode levar semanas. Vale pedir o eu.org
**agora**, em paralelo, já que não custa nada e só depende de esperar.

---

## Arquitetura

```
Visitante  ──►  hubeventosieq.pages.dev      Cloudflare Pages (SPA React + Vite)
                  │                          banda ilimitada, assets estáticos ilimitados
                  ├─► /api/*                 Pages Functions ──► D1  (metadados)
                  ├─► /img/*                 Pages Function  ──► R2  (arquivos)
                  └─► /admin                 protegido por Cloudflare Access (Google)

Asafe (PC)  ──►  npm run publicar            sharp + wrangler ──► R2 + D1
```

### Limites do plano gratuito e o que cabe neles

| Serviço | Limite grátis | O que significa aqui |
| --- | --- | --- |
| Pages (site) | Banda **ilimitada**, 500 builds/mês, 20.000 arquivos | O site nunca é o gargalo |
| Pages Functions | 100.000 req/dia, 10ms CPU | ~1.600 galerias abertas/dia |
| R2 (fotos) | **10 GB**, 1M escritas/mês, 10M leituras/mês, egress **$0** | ~33 eventos de 500 fotos |
| D1 (banco) | 5 GB, 5M linhas lidas/dia, 100k escritas/dia | Sobra absurdamente |
| Access (login) | 50 usuários | Você e a equipe |

**Nada disso expira nem pausa por inatividade** — foi o motivo de sair do Supabase, cujo
plano grátis dá só 1 GB de fotos, 5 GB de banda/mês e pausa o banco após 7 dias parado
(o projeto atual precisou de um cron diário só para manter o banco acordado).

### Orçamento de armazenamento

Cada foto vira 3 arquivos WebP no R2:

| Versão | Tamanho | Peso | Para quê |
| --- | --- | --- | --- |
| `t` (thumb) | 400px | ~30 KB | Grade |
| `m` (médio) | 1080px | ~130 KB | Visualizador em tela cheia |
| `g` (grande) | 2048px | ~450 KB | Download e ZIP |

**~610 KB por foto → ~305 MB por evento de 500 fotos → ~33 eventos nos 10 GB.**

Com um evento por mês, isso é quase 3 anos. Se o ritmo for maior, a saída é **arquivar**:
apagar as versões `m` e `g` de eventos com mais de um ano (mantendo o thumb, para a
página não ficar quebrada) libera ~80% do espaço daquele evento. Fica como tarefa do
painel, não como emergência.

> Se algum dia for preciso guardar o original da câmera, é ~2,5 GB por evento — os 10 GB
> acabam em 4 eventos. Por isso a decisão foi entregar 2048px, que já serve para
> Instagram, WhatsApp e impressão até 15×21cm.

---

## Estrutura do projeto novo

Repositório novo em **`c:\Projetos\HubEventosIEQ`**, começando do zero mas copiando
arquivos inteiros do molde sempre que possível — e cortando o vínculo em seguida.

```
HubEventosIEQ/
  functions/                      Pages Functions (backend)
    api/
      eventos.ts                  GET  lista de eventos publicados (home)
      eventos/[slug].ts           GET  um evento + suas fotos (paginado)
      admin/
        eventos.ts                GET/POST/PATCH/DELETE  — atrás do Access
        upload.ts                 POST  recebe foto do painel web
        _middleware.ts            valida o JWT do Cloudflare Access
    img/[[caminho]].ts            serve o R2 com cache imutável
    _middleware.ts                injeta as meta tags OG por evento (HTMLRewriter)
  migrations/
    0001_inicial.sql              schema do D1
  scripts/
    publicar-evento.mjs           pipeline sharp + envio ao R2/D1
  src/
    components/
      ui/                         shadcn — COPIAR do molde (ou reinstalar do zero)
      galeria/
        GradeFotos.tsx            COPIAR (masonry com columns do CSS)
        CartaoFoto.tsx            COPIAR e simplificar (tirar o coração de seleção)
        Visualizador.tsx          COPIAR (lightbox)
        EnvioEmMassa.tsx          COPIAR (drag-and-drop, fila de 3)
      Imagem.tsx                  COPIAR (LQIP + srcSet + fallback)
      LimiteDeErro.tsx            COPIAR
      layout/                     Header e Footer novos, mais simples
    lib/
      fotos.ts                    ADAPTAR de galeria/marcaDagua.ts — SEM marca d'água
      zip.ts                      COPIAR inteiro (client-zip em fluxo)
      api.ts                      cliente das Functions
      utils.ts                    COPIAR (cn)
    pages/
      Home.tsx                    a capa: o que é o site + grade de eventos
      Evento.tsx                  /e/:slug — o hub de fotos
      admin/                      painel
    index.css                     COPIAR inteiro (design system Tailwind v4)
  wrangler.toml                   bindings de R2, D1 e variáveis
```

### O molde: o que vale copiar na etapa 1

> **Esta é a única etapa que abre a pasta do outro projeto.** Copie os arquivos, feche a
> pasta e não volte mais lá. Os caminhos abaixo são a origem da cópia — não são
> dependências, não devem virar import, alias nem link.

Origem: `c:\Projetos\LandingPageAS`. Estes arquivos já resolvem problemas difíceis e vêm
com comentários explicando o porquê de cada decisão. Copiar o conteúdo, não reescrever:

| Arquivo na origem | Por que ele vale | O que mudar ao trazer |
| --- | --- | --- |
| `src/index.css` | 812 linhas: design system inteiro em Tailwind v4 CSS-first, tokens, animações, `safe-area`, `prefers-reduced-motion`. Não existe `tailwind.config.js` | Renomear os tokens `--kit-*` e `--marca-*` para os da igreja quando a identidade chegar. As fontes vêm de pacotes npm, então não criam vínculo |
| `src/lib/galeria/zip.ts` | ZIP em fluxo com `client-zip`, grava direto no disco via `showSaveFilePicker`, com todos os caminhos de erro já mapeados em produção | Trocar a origem das URLs para `/img/*` |
| `src/components/Imagem.tsx` | Imagem progressiva: LQIP, `srcSet`, sem pulo de layout, trata imagem em cache | Nada — vem limpo |
| `src/components/galeria/GradeFotos.tsx` | Mosaico com `columns` do CSS — zero JavaScript, sem biblioteca | Trocar os tipos do Supabase pelos tipos daqui |
| `src/components/galeria/EnvioEmMassa.tsx` | Drag-and-drop sem dependência, fila de 3 trabalhadores, falha isolada por arquivo | Trocar a função de envio pela que fala com a Function |
| `scripts/preparar-fotos.mjs` | Pipeline `sharp`: WebP em várias larguras, LQIP de 20px, nunca amplia | Vira `publicar-evento.mjs`: larguras 400/1080/2048 e destino R2, não `public/` |
| `src/lib/galeria/marcaDagua.ts` | O redimensionamento client-side (`createImageBitmap` com `resizeWidth`, que evita estourar memória com JPEG de 40MP) | **Aproveitar só essa parte.** A marca d'água inteira sai, junto com a logo que ela carrega |

**NÃO copiar:** `src/data/marca.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`,
`src/lib/analytics.ts`, `src/lib/repos/*`, `api/manter-acordado.ts`, a pasta `supabase/`,
`index.html`, `vercel.json`, e qualquer arquivo de `public/marca/`, `public/animacao/` ou
`public/portfolio/`. São do outro projeto — trazem Supabase, Vercel, o Analytics e a
marca de outra pessoa junto.

**Manter as convenções do molde**, que são boas: texto de tela em português com acento,
código e nomes de arquivo em ASCII sem acento. Comentários explicando *por quê*, não
*o quê*.

---

## Banco de dados (D1)

```sql
create table eventos (
  id            text primary key,
  slug          text not null unique,
  titulo        text not null,
  descricao     text,
  data_evento   text,                          -- AAAA-MM-DD
  capa_id       text,                          -- id da foto usada como capa
  status        text not null default 'rascunho',   -- rascunho | publicado
  listado       integer not null default 1,    -- 0 = só quem tem o link
  destaque      integer not null default 0,    -- fixa no topo da home
  permite_zip   integer not null default 1,
  cor_destaque  text,                          -- hex; sobrescreve --primary
  layout        text not null default 'mosaico',    -- mosaico | uniforme
  ordem_fotos   text not null default 'envio',      -- envio | nome | data
  total_fotos   integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

create table fotos (
  id            text primary key,
  evento_id     text not null references eventos(id) on delete cascade,
  chave         text not null,                 -- prefixo no R2: <evento>/<uuid>
  extensao      text not null default 'webp',
  nome_original text,
  largura       integer,
  altura        integer,
  lqip          text,                          -- base64 de 20px, embutido no JSON
  ordem         integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

create index idx_fotos_evento on fotos(evento_id, ordem);
create index idx_eventos_status on eventos(status, destaque, data_evento desc);
```

A **personalização por evento** que o Asafe pediu vive nas colunas `capa_id`,
`cor_destaque`, `layout`, `ordem_fotos`, `destaque`, `listado` e `permite_zip`. A
`cor_destaque` funciona injetando `--primary` num wrapper da página do evento — o design
system já é todo baseado em variáveis CSS, então isso é uma linha de `style`, não um tema
paralelo.

No R2, cada foto ocupa três chaves: `<evento>/<uuid>-t.webp`, `-m.webp` e `-g.webp`.

---

## Etapas de implementação

### 1. Fundação e corte do vínculo (meio dia)

- `npm create vite@latest` com React + TS **nesta pasta**, com `name` próprio no
  `package.json` (`hub-eventos-ieq`) e versão `0.1.0`. Não copiar o `package.json` do
  molde inteiro: começar do zero e adicionar só as dependências que este projeto usa
  (fora Supabase, fora `embla-carousel`, fora `react-day-picker`, fora `date-fns`).
- `git init` aqui. Repositório novo, primeiro commit próprio, sem histórico herdado.
- Copiar os arquivos da tabela do molde (seção anterior) e ajustar cada um conforme a
  coluna "o que mudar". **Fechar a pasta do outro projeto e não voltar mais.**
- Escrever `vite.config.ts` e os `tsconfig*.json` do zero, com o alias `@` apontando só
  para `./src` daqui. Nenhum caminho pode sair da pasta.
- Criar conta Cloudflare, `npm i -D wrangler`, `wrangler login`.
- Criar bucket R2 e banco D1 **novos**, com nomes próprios; declarar os bindings no
  `wrangler.toml`. Não reaproveitar nenhum recurso da conta do site de fotografia.
- Rodar a migração `0001_inicial.sql`.
- **Verificação 1:** `npm run dev` sobe a página com as fontes e cores certas;
  `wrangler d1 execute --local` lista as duas tabelas.
- **Verificação 2 — o teste de independência:** renomear `c:\Projetos\LandingPageAS` para
  `LandingPageAS_off`, rodar `npm ci && npm run build` aqui e confirmar que passa. Depois
  desfazer o nome. **Se quebrar, sobrou vínculo — ache e corte antes de seguir.**
- **Verificação 3:** `grep -ri "supabase\|vercel\|LandingPageAS\|G-3WTVFJZMZL\|asafefotografia" .`
  ignorando `node_modules` não pode achar nada fora deste próprio arquivo de plano.

### 2. Leitura pública (o coração do site)

- `functions/img/[[caminho]].ts` — lê o R2 pelo binding, devolve com
  `Cache-Control: immutable` e usa a Cache API do edge. É o arquivo mais importante do
  projeto: dele dependem a quota e a velocidade.
- `functions/api/eventos.ts` e `functions/api/eventos/[slug].ts` — leitura do D1, com
  paginação de 60 fotos.
- Página `Home.tsx`: texto explicando o que é o site + grade de cartões de evento.
- Página `Evento.tsx`: `GradeFotos` + `Visualizador` + botão de download por foto.
- **Verificação:** semear um evento de teste no D1 e 20 fotos no R2 pelo `wrangler`, abrir
  `/e/teste` e conferir no DevTools que a segunda visita não faz nenhuma requisição de
  imagem (tudo do cache).

### 3. Download

- Copiar `zip.ts`; trocar a origem das URLs para o caminho `/img/*`.
- Botão "Baixar tudo" com barra de progresso e opção de cancelar.
- Download individual pelo cartão e pelo visualizador.
- **Verificação:** baixar um ZIP de 20 fotos no Chrome (grava direto no disco) e no
  Firefox (cai para o download comum) — os dois caminhos precisam funcionar.

### 4. Painel admin

- Ligar o Cloudflare Access no projeto Pages, política de e-mail, provedor Google.
- `functions/api/admin/_middleware.ts` valida o JWT do header `Cf-Access-Jwt-Assertion`
  contra as chaves públicas da equipe. **Isso é o que protege de verdade** — esconder o
  botão no site não é segurança, mesma lição do projeto atual.
- Telas: lista de eventos, criar/editar (com todos os campos de personalização),
  reordenar fotos, definir capa, publicar/despublicar, apagar.
- Upload web reaproveitando `EnvioEmMassa`: o navegador gera as três versões WebP antes de
  enviar (sem marca d'água) e a Function grava no R2 e no D1.
- **Verificação:** abrir `/admin` numa aba anônima e confirmar que o Access barra antes da
  página carregar; subir 10 fotos pelo painel e vê-las aparecer no evento.

### 5. Script de publicação em massa

- `scripts/publicar-evento.mjs`: recebe uma pasta, gera as três versões com `sharp` +
  LQIP, envia ao R2 e insere no D1 em lote.
- Retomável: se cair na foto 300 de 500, rodar de novo continua de onde parou (compara o
  que já existe no D1 pelo `nome_original`).
- **Verificação:** publicar uma pasta real de 500 fotos e cronometrar; conferir o espaço
  usado no painel do R2 contra a estimativa de ~305 MB.

### 6. Compartilhamento e acabamento

- `functions/_middleware.ts` com `HTMLRewriter` injetando `og:title`, `og:description` e
  `og:image` (a capa do evento) no HTML de `/e/:slug`. **Sem isso o link colado no
  Instagram e no WhatsApp aparece sem imagem** — e é justamente por ali que as pessoas
  vão chegar.
- `robots.txt` bloqueando `/admin`, `manifest.webmanifest`, favicon.
- Página 404 e `LimiteDeErro` em volta das rotas.
- README explicando como criar um evento novo, do jeito direto que o README atual tem.
- **Verificação:** colar o link de um evento no WhatsApp e ver a prévia com a capa.

---

## Verificação final, ponta a ponta

1. `npm run build && wrangler pages deploy` publica sem erro.
2. Criar um evento pelo painel, subir 500 fotos pelo script, publicar.
3. Abrir o link num celular na rede móvel (não no Wi-Fi): a grade tem que aparecer em
   poucos segundos, rolar liso e as fotos entrarem sem a página pular.
4. Baixar uma foto e o ZIP completo pelo celular e pelo PC.
5. Colar o link no Instagram e no WhatsApp e conferir a prévia com imagem.
6. Conferir no painel da Cloudflare: requisições do dia, espaço no R2, linhas no D1.
7. Abrir `/admin` deslogado e confirmar o bloqueio do Access.
8. **Teste de independência, de novo:** com `c:\Projetos\LandingPageAS` renomeada,
   `npm ci && npm run build && wrangler pages deploy` tem que funcionar do começo ao fim.
   Este projeto precisa sobreviver ao outro ser movido, renomeado ou apagado.

---

## O que fica de fora, de propósito

- **Qualquer vínculo com o A.S. Fotografia** — ver a regra número um. Ele é molde, não
  dependência: nada de import, alias, symlink, submódulo, conta ou recurso compartilhado.
- **A marca do outro projeto** — logo, `og.jpg`, favicon, telefone, e-mail, JSON-LD e o
  ID do Google Analytics ficam todos lá.
- **Marca d'água** — o Asafe pediu explicitamente sem.
- **PIN / login do visitante** — o acesso é público; é o que resolve a dor do Drive.
- **Seleção de fotos pelo cliente** (o coração ❤️ do outro projeto) — aqui não faz
  sentido, ninguém escolhe fotos para edição.
- **Original da câmera** — decisão consciente de entregar 2048px para caber no grátis.
- **Domínio próprio** — adiado, com os gatilhos e a chave `BASE_FOTOS` já preparados.

---

## Fontes dos limites citados

- [Cloudflare Pages Functions — pricing](https://developers.cloudflare.com/pages/functions/pricing/) (100k req/dia; assets estáticos grátis e ilimitados)
- [Cloudflare R2 — public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) (o `r2.dev` é limitado e só para desenvolvimento)
- [Cloudflare Workers — pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Limites do plano grátis da Cloudflare em 2026](https://agentdeals.dev/vendor/cloudflare) (R2 10 GB, D1 5 GB)
- [Zero Trust / Access — plano grátis](https://zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026/) (50 usuários)
- [Limites do plano grátis do Supabase em 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) (1 GB de arquivos, pausa em 7 dias) — o motivo da mudança
- [Vercel Hobby em 2026](https://zplatform.ai/guides/is-vercel-free/) (100 GB/mês; proíbe doações) — o outro motivo
- [Domínio gratuito permanente no eu.org com Cloudflare](https://indexedev.com/post/how-to-get-a-free-eu-org-domain-and-set-it-up-with-cloudflare/)

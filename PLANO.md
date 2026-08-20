# Hub de Fotos da Igreja — plano de ação

## Contexto

Hoje as fotos dos eventos da igreja vão para o Google Drive e o link é divulgado no
Instagram. Isso não funciona bem: o Drive pede conta, às vezes exige permissão, o link
expira, a visualização no celular é ruim e nada disso tem a cara da igreja.

A ideia é um **hub próprio de entrega de fotos**: uma página central que explica o que é
o site e lista os eventos, e uma página por evento com as fotos numa grade bonita, onde
qualquer pessoa entra pelo link, vê e baixa — sem conta, sem PIN, sem marca d'água.

A base técnica se **inspira** no projeto A.S. Fotografia (`c:\Projetos\LandingPageAS`),
que já tem galeria em mosaico, visualizador, download em ZIP no navegador, pipeline de
imagens com `sharp` e um design system completo. O que muda é o backend: sai
Supabase/Vercel, entra **Cloudflare**.

**Decisões já tomadas com o Asafe:**

| Assunto | Decisão |
| --- | --- |
| Volume | 500+ fotos por evento |
| Acesso | Totalmente público — link aberto, sem PIN |
| Hospedagem | Cloudflare Pages + D1 |
| Fotos | **Arquivos estáticos do próprio site** — ver a regra do cartão, abaixo |
| Upload | Por script no PC. O painel web cuida do resto |
| Download | Versão alta para web (~2048px), não o original da câmera |
| Login admin | Cloudflare Access com conta Google |
| Visual | Começa com o tema do molde, troca a identidade depois |
| Domínio | Não tem, e **não precisa** nesta arquitetura |
| Vínculo | **Projeto 100% independente.** O A.S. Fotografia é só molde |

---

## Regra número zero: NADA neste projeto pede cartão de crédito

O Asafe não tem cartão disponível, e essa é uma restrição dura, não uma preferência.

**O Cloudflare R2 exige cartão cadastrado mesmo para usar o plano grátis** — a Cloudflare
faz uma autorização de teste na ativação, e cartão de débito ou pré-pago é recusado. Foi
o que aconteceu na prática ("sem saldo disponível"). **Por isso o R2 está fora deste
projeto.**

O que continua valendo, tudo sem cartão nenhum:

| Serviço | Precisa de cartão? |
| --- | --- |
| Cloudflare Pages (o site) | **Não** |
| Pages Functions / Workers | **Não** |
| D1 (banco) | **Não** |
| Cloudflare Access (login admin) | **Não** |
| ~~R2 (armazenamento)~~ | **SIM — está fora** |

> **Para quem for implementar:** se em algum momento a solução mais óbvia parecer ser
> "põe no R2", pare. Não é opção aqui. O mesmo vale para qualquer serviço que peça cartão
> na ativação — se aparecer essa tela, é o caminho errado.

---

## A ideia central: as fotos são arquivos do site

Em vez de guardar as fotos num serviço de armazenamento, elas viram **assets estáticos do
Cloudflare Pages**, publicados junto com o site.

Isso não é um remendo — em vários aspectos é melhor que o R2:

| | Fotos como assets estáticos | R2 servido por Function |
| --- | --- | --- |
| Cartão | Não precisa | **Precisa** |
| Banda | Ilimitada | Ilimitada |
| Requisições | **Ilimitadas** | 100 mil/dia |
| Risco do ZIP | Nenhum | 500 requisições por download |
| Precisa de domínio | Não | Sim, na prática |
| Teto de crescimento | 20.000 arquivos | 10 GB |
| Upload pelo navegador | Não | Sim |

O teto de 100 mil requisições por dia e o risco de um ZIP de 500 fotos comer meio dia de
quota — que eram os pontos frágeis da versão anterior deste plano — **deixam de existir**.
Requisições a assets estáticos são grátis e ilimitadas nos dois planos da Cloudflare, e um
`.pages.dev` já entrega isso sem domínio próprio.

### O que se perde, e é justo saber

**Subir foto pelo navegador sai.** Arquivo estático só entra num deploy, então publicar um
evento é rodar um comando no PC:

```
npm run publicar "C:\Fotos\Culto de Jovens 2026"
```

O comando otimiza as 500 fotos, organiza, grava os metadados e publica. O painel web
continua existindo e funcionando de qualquer lugar, inclusive do celular, para **criar
evento, editar título e descrição, reordenar fotos, escolher a capa, personalizar cores,
publicar e despublicar** — só o envio de arquivo é que exige o PC.

**Você vira o backup.** As fotos moram na sua máquina e são publicadas de lá. Se a pasta
do projeto se perder, não há de onde republicar. **Guarde a pasta `fotos/` num HD externo
ou no Drive** — isso é obrigação do projeto, não zelo excessivo.

### Orçamento: 20.000 arquivos

O limite do plano grátis é **20.000 arquivos por site** e 25 MB por arquivo, somando todos
os eventos. Cada foto vira **dois** arquivos WebP:

| Versão | Largura | Peso | Para quê |
| --- | --- | --- | --- |
| `t` (thumb) | 400px | ~30 KB | Grade em mosaico |
| `g` (grande) | 2048px | ~450 KB | Visualizador, download e ZIP |

**2 arquivos por foto → 1.000 arquivos por evento de 500 fotos → ~20 eventos.**

> Foram dois tamanhos, não três, justamente porque aqui o gargalo é **contagem de
> arquivos**, não espaço. Cortar o tamanho médio de 1080px troca ~420 KB a mais no
> visualizador por 10 eventos a mais de vida útil. Vale a troca.

**Arquivamento**, quando passar de ~18.000 arquivos: apagar as versões `g` dos eventos com
mais de um ano, mantendo as `t`. A página continua de pé, a grade continua bonita, só o
download daquele evento antigo deixa de existir. Libera ~94% dos arquivos daquele evento.

### E se um dia crescer além disso

Três saídas, em ordem de esforço, sem pressa nenhuma:

1. **Arquivar** os eventos antigos, como acima. Resolve por anos.
2. **Segundo projeto Pages** para os eventos antigos (`arquivo.hubeventosieq.pages.dev`).
   Cada projeto tem seus próprios 20.000 arquivos, e continua tudo grátis e sem cartão.
3. **Migrar para o R2**, se um dia houver cartão. A troca é localizada: muda de onde vem
   a URL da foto. Por isso o código guarda o **caminho relativo** da foto no banco e monta
   a URL final numa função só (`urlFoto()` em `src/lib/fotos.ts`) — trocar a origem é
   mexer nesse único ponto.

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
- **Contas e recursos próprios**: banco D1 e projeto Pages novos, com nomes próprios.
- **Identidade própria**: os arquivos de marca do A.S. Fotografia (logo, `og.jpg`,
  favicon, `src/data/marca.ts`, telefone e e-mail no `index.html`, o JSON-LD) **não vêm
  junto**. O que se copia é o *sistema* de cores e tipografia, não a marca de ninguém.
- **Sem Google Analytics herdado** — o ID `G-3WTVFJZMZL` está no código do molde; se algum
  arquivo copiado o trouxer, apague.

Quando um arquivo for copiado, ele passa a ser **deste projeto**: pode ser editado,
renomeado ou jogado fora à vontade. Melhorias feitas aqui não voltam para lá, e mudanças
lá não chegam aqui.

**Teste de independência** (no fim da etapa 1 e no fim do projeto): renomeie
temporariamente `c:\Projetos\LandingPageAS` para `LandingPageAS_off`, rode
`npm ci && npm run build` aqui e confirme que passa. Depois desfaça o nome. Se quebrar,
sobrou um vínculo — encontre e corte.

---

## Arquitetura

```
Visitante  ──►  hubeventosieq.pages.dev     Cloudflare Pages
                  │
                  ├─► /fotos/...            ARQUIVOS ESTÁTICOS
                  │                         banda e requisicoes ILIMITADAS
                  ├─► /api/*                Pages Functions ──► D1 (metadados)
                  └─► /admin                Cloudflare Access (Google)

Asafe (PC) ──►  npm run publicar "<pasta>"
                  1. sharp gera -t.webp e -g.webp em fotos/<slug>/
                  2. insere os metadados no D1
                  3. wrangler pages deploy  (envio incremental, so o que e novo)
```

### Limites do plano gratuito

| Serviço | Limite grátis | O que significa aqui |
| --- | --- | --- |
| Pages — assets | **Banda e requisições ilimitadas**, 20.000 arquivos, 25 MB cada | ~20 eventos de 500 fotos |
| Pages — builds | 500 por mês | ~16 publicações por dia |
| Pages Functions | 100.000 req/dia | 1 requisição por visita de página, não por foto |
| D1 (banco) | 5 GB, 5M linhas lidas/dia | Sobra absurdamente |
| Access (login) | 50 usuários | Você e a equipe |

Repare no ponto que mudou tudo: as Functions só respondem **a página e a lista de fotos**,
1 requisição por visita. As fotos não passam por elas. Dá para receber **100 mil visitas
por dia** dentro do plano grátis.

**Nada disso expira nem pausa por inatividade** — foi o motivo de sair do Supabase, cujo
plano grátis dá 1 GB de arquivos, 5 GB de banda/mês e pausa o banco após 7 dias parado.

---

## Estrutura do projeto

Repositório novo em **`c:\Projetos\HubEventosIEQ`**, começando do zero mas copiando
arquivos inteiros do molde sempre que possível — e cortando o vínculo em seguida.

```
HubEventosIEQ/
  fotos/                          AS FOTOS PROCESSADAS — fora do git, e o "banco" real
    culto-jovens-2026/            um subdiretorio por evento
      a1b2-t.webp  a1b2-g.webp
  functions/                      Pages Functions (backend)
    api/
      eventos.ts                  GET  lista de eventos publicados (home)
      eventos/[slug].ts           GET  um evento + suas fotos
      admin/
        eventos.ts                GET/POST/PATCH/DELETE  — atras do Access
        _middleware.ts            valida o JWT do Cloudflare Access
    _middleware.ts                injeta as meta tags OG por evento (HTMLRewriter)
  migrations/
    0001_inicial.sql              schema do D1
  scripts/
    publicar.mjs                  sharp + D1 + wrangler pages deploy
    arquivar.mjs                  apaga as versoes -g de eventos antigos
  src/
    components/
      ui/                         shadcn — COPIAR do molde (ou reinstalar do zero)
      galeria/
        GradeFotos.tsx            COPIAR (masonry com columns do CSS)
        CartaoFoto.tsx            COPIAR e simplificar (tirar o coracao de selecao)
        Visualizador.tsx          COPIAR (lightbox)
      Imagem.tsx                  COPIAR (LQIP + srcSet + fallback)
      LimiteDeErro.tsx            COPIAR
      layout/                     Header e Footer novos, mais simples
    lib/
      fotos.ts                    urlFoto() — O UNICO lugar que monta URL de foto
      zip.ts                      COPIAR inteiro (client-zip em fluxo)
      api.ts                      cliente das Functions
      utils.ts                    COPIAR (cn)
    pages/
      Home.tsx                    a capa: o que e o site + grade de eventos
      Evento.tsx                  /e/:slug — o hub de fotos
      admin/                      painel
    index.css                     COPIAR inteiro (design system Tailwind v4)
  wrangler.toml                   binding do D1 e variaveis
  .gitignore                      IGNORA fotos/ e dist/
```

**A pasta `fotos/` fica fora do git de propósito.** Alguns GB de imagem num repositório
deixam qualquer operação lenta e estouram os limites do GitHub. Ela é sincronizada por
outro caminho — HD externo ou Drive — e isso precisa estar escrito no README.

### Como as fotos chegam ao `dist/`

O `vite build` limpa o `dist/`, então as fotos não podem morar em `public/` (o Vite
copiaria vários GB a cada build). O `scripts/publicar.mjs` faz assim:

1. `vite build` → `dist/` só com o app, rápido.
2. Popula `dist/fotos/` a partir de `fotos/` usando **hardlink** (`fs.link`) — instantâneo
   e sem duplicar espaço em disco. Se falhar (partições diferentes), cai para cópia.
3. `wrangler pages deploy dist` — o Wrangler compara por hash e **só envia o que é novo**,
   então publicar o segundo evento não reenvia o primeiro.

### O molde: o que vale copiar na etapa 1

> **Esta é a única etapa que abre a pasta do outro projeto.** Copie os arquivos, feche a
> pasta e não volte mais. Os caminhos abaixo são a origem da cópia — não são
> dependências, não devem virar import, alias nem link.

Origem: `c:\Projetos\LandingPageAS`. Copiar o conteúdo com comando de shell (`cp`), **não
reescrever** — são arquivos grandes e já corretos.

| Arquivo na origem | Por que ele vale | O que mudar ao trazer |
| --- | --- | --- |
| `src/index.css` | 812 linhas: design system inteiro em Tailwind v4 CSS-first, tokens, animações, `safe-area`, `prefers-reduced-motion`. Não existe `tailwind.config.js` | Renomear os tokens `--kit-*` e `--marca-*` quando a identidade da igreja chegar. As fontes vêm de pacotes npm, não criam vínculo |
| `src/lib/galeria/zip.ts` | ZIP em fluxo com `client-zip`, grava direto no disco via `showSaveFilePicker`, com os caminhos de erro já mapeados em produção | Trocar a origem das URLs para `urlFoto()` |
| `src/components/Imagem.tsx` | Imagem progressiva: LQIP, `srcSet`, sem pulo de layout, trata imagem em cache | Nada — vem limpo |
| `src/components/galeria/GradeFotos.tsx` | Mosaico com `columns` do CSS — zero JavaScript, sem biblioteca | Trocar os tipos do Supabase pelos tipos daqui |
| `src/components/galeria/Visualizador.tsx` | Lightbox com teclado e gestos | Tirar o botão de seleção |
| `scripts/preparar-fotos.mjs` | Pipeline `sharp`: WebP em várias larguras, LQIP de 20px, nunca amplia | Vira `publicar.mjs`: larguras 400/2048, destino `fotos/<slug>/`, e as etapas de D1 e deploy |
| `src/lib/galeria/marcaDagua.ts` | Só a técnica de redimensionar com `createImageBitmap` + `resizeWidth`, que evita estourar memória com JPEG de 40MP | **A marca d'água inteira sai.** Aqui o `sharp` faz o trabalho no PC, então talvez nem seja preciso |

**NÃO copiar:** `src/data/marca.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`,
`src/lib/analytics.ts`, `src/lib/repos/*`, `src/components/galeria/EnvioEmMassa.tsx`
(não há mais upload pelo navegador), `api/manter-acordado.ts`, a pasta `supabase/`,
`index.html`, `vercel.json`, e qualquer arquivo de `public/marca/`, `public/animacao/` ou
`public/portfolio/`.

**Manter as convenções do molde**, que são boas: texto de tela em português com acento,
código e nomes de arquivo em ASCII sem acento. Comentários explicam *por quê*, não *o quê*.

---

## Banco de dados (D1)

```sql
create table eventos (
  id            text primary key,
  slug          text not null unique,          -- tambem e o nome da pasta em fotos/
  titulo        text not null,
  descricao     text,
  data_evento   text,                          -- AAAA-MM-DD
  capa_id       text,                          -- id da foto usada como capa
  status        text not null default 'rascunho',   -- rascunho | publicado
  listado       integer not null default 1,    -- 0 = so quem tem o link
  destaque      integer not null default 0,    -- fixa no topo da home
  permite_zip   integer not null default 1,
  cor_destaque  text,                          -- hex; sobrescreve --primary
  layout        text not null default 'mosaico',    -- mosaico | uniforme
  arquivado     integer not null default 0,    -- 1 = versoes -g removidas
  total_fotos   integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

create table fotos (
  id            text primary key,
  evento_id     text not null references eventos(id) on delete cascade,
  caminho       text not null,                 -- 'culto-jovens-2026/a1b2' — SEM sufixo
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

**`caminho` guarda o prefixo sem sufixo nem extensão.** Quem monta a URL final é
`urlFoto(caminho, 't' | 'g')` em `src/lib/fotos.ts` — **o único lugar do código que sabe
de onde vem uma foto**. É o que torna barata uma migração futura para R2 ou para um
segundo projeto Pages.

A **personalização por evento** vive nas colunas `capa_id`, `cor_destaque`, `layout`,
`destaque`, `listado` e `permite_zip`. A `cor_destaque` funciona injetando `--primary` num
wrapper da página do evento — o design system é todo baseado em variáveis CSS, então é uma
linha de `style`, não um tema paralelo.

---

## Etapas de implementação

### 1. Fundação e corte do vínculo

- `npm create vite@latest` com React + TS **nesta pasta**, `name` próprio
  (`hub-eventos-ieq`), versão `0.1.0`. Não copiar o `package.json` do molde: começar do
  zero e adicionar só o que este projeto usa (fora Supabase, `embla-carousel`,
  `react-day-picker`, `date-fns`).
- `git init` aqui. Repositório novo, primeiro commit próprio, sem histórico herdado.
- `.gitignore` com `fotos/`, `dist/`, `node_modules/`, `.env*`.
- Copiar os arquivos da tabela do molde **com `cp`** e ajustar conforme a coluna "o que
  mudar". **Fechar a pasta do outro projeto e não voltar mais.**
- Escrever `vite.config.ts` e os `tsconfig*.json` do zero, alias `@` só para `./src`.
- `npm i -D wrangler` e `wrangler login`. **PARE AQUI e peça ao Asafe** — exige navegador.
- Criar o banco D1 (`wrangler d1 create`) e declarar o binding no `wrangler.toml`.
  **Nenhum passo deve pedir cartão. Se pedir, é o caminho errado.**
- Rodar a migração `0001_inicial.sql`.
- **Verificação 1:** `npm run dev` sobe a página com as fontes e cores certas;
  `wrangler d1 execute --local` lista as duas tabelas.
- **Verificação 2 — independência:** renomear `c:\Projetos\LandingPageAS` para
  `LandingPageAS_off`, rodar `npm ci && npm run build` e confirmar que passa. Desfazer.
- **Verificação 3:** `grep -ri "supabase\|vercel\|LandingPageAS\|G-3WTVFJZMZL\|r2\b" .`
  ignorando `node_modules` não pode achar nada fora deste arquivo de plano.

### 2. O script de publicação (venha antes das telas)

Este vem primeiro porque sem ele não há foto nenhuma para as telas mostrarem.

- `scripts/publicar.mjs`: recebe uma pasta, gera `-t.webp` (400px) e `-g.webp` (2048px)
  com `sharp` + LQIP de 20px, grava em `fotos/<slug>/`, insere no D1, faz o build,
  popula `dist/fotos/` por hardlink e chama `wrangler pages deploy dist`.
- **Retomável:** se cair na foto 300 de 500, rodar de novo continua de onde parou
  (compara `nome_original` com o que já está no D1).
- Avisa quantos arquivos o site tem no total e alerta acima de 18.000.
- **Verificação:** publicar uma pasta de teste com 20 fotos e conferir os arquivos em
  `fotos/`, as linhas no D1 e os arquivos no deploy.

### 3. Leitura pública

- `functions/api/eventos.ts` e `functions/api/eventos/[slug].ts` — leitura do D1.
- `src/lib/fotos.ts` com `urlFoto()`.
- `Home.tsx`: texto explicando o que é o site + grade de cartões de evento.
- `Evento.tsx`: `GradeFotos` + `Visualizador` + download por foto.
- **Verificação:** abrir `/e/teste`, conferir no DevTools que as fotos vêm de `/fotos/...`
  como arquivo estático (não de uma Function) e que a segunda visita usa o cache.

### 4. Download

- Copiar `zip.ts`; apontar as URLs para `urlFoto(..., 'g')`.
- Botão "Baixar tudo" com progresso e cancelamento; download individual no cartão e no
  visualizador.
- **Verificação:** baixar um ZIP no Chrome (grava direto no disco) e no Firefox (cai para
  o download comum) — os dois caminhos precisam funcionar.

### 5. Painel admin

- Ligar o Cloudflare Access no projeto Pages, política por e-mail, provedor Google.
  **PARE e peça ao Asafe** — é configuração no painel da Cloudflare.
- `functions/api/admin/_middleware.ts` valida o JWT do header `Cf-Access-Jwt-Assertion`.
  **Isso é o que protege de verdade** — esconder o botão no site não é segurança.
- Telas: lista de eventos, criar/editar com todos os campos de personalização, reordenar
  fotos, definir capa, publicar/despublicar, apagar.
- **Sem upload de arquivo** — o painel edita o D1, as fotos vêm pelo script.
- **Verificação:** abrir `/admin` numa aba anônima e confirmar que o Access barra antes da
  página carregar; criar um evento pelo celular e vê-lo aparecer na home.

### 6. Compartilhamento e acabamento

- `functions/_middleware.ts` com `HTMLRewriter` injetando `og:title`, `og:description` e
  `og:image` (a capa) no HTML de `/e/:slug`. **Sem isso o link colado no Instagram e no
  WhatsApp aparece sem imagem** — e é por ali que as pessoas vão chegar.
- `scripts/arquivar.mjs`: apaga as versões `-g` de um evento e marca `arquivado = 1`.
- `robots.txt` bloqueando `/admin`, `manifest.webmanifest`, favicon, página 404.
- README explicando como publicar um evento novo e **onde fica o backup da pasta `fotos/`**.
- **Verificação:** colar o link de um evento no WhatsApp e ver a prévia com a capa.

---

## Verificação final, ponta a ponta

1. `npm run publicar` com uma pasta real de 500 fotos termina sem erro.
2. Conferir a contagem de arquivos do site no painel do Pages (deve dar ~1.000 por evento).
3. Abrir o link num celular na rede móvel (não no Wi-Fi): a grade aparece em poucos
   segundos, rola liso e as fotos entram sem a página pular.
4. Baixar uma foto e o ZIP completo, no celular e no PC.
5. Colar o link no Instagram e no WhatsApp e conferir a prévia com imagem.
6. Criar e editar um evento pelo painel, do celular.
7. Abrir `/admin` deslogado e confirmar o bloqueio do Access.
8. **Independência:** com `LandingPageAS` renomeada, `npm ci && npm run build` e o deploy
   funcionam do começo ao fim.
9. **Sem cartão:** revisar que nenhum serviço usado pediu cartão em momento algum.

---

## O que fica de fora, de propósito

- **Cloudflare R2 e qualquer serviço que peça cartão** — ver a regra número zero.
- **Upload de foto pelo navegador** — consequência da escolha acima, aceita conscientemente.
- **Qualquer vínculo com o A.S. Fotografia** — ver a regra número um.
- **A marca do outro projeto** — logo, `og.jpg`, favicon, telefone, e-mail, JSON-LD e o ID
  do Google Analytics ficam todos lá.
- **Marca d'água** — o Asafe pediu explicitamente sem.
- **PIN / login do visitante** — o acesso é público; é o que resolve a dor do Drive.
- **Seleção de fotos pelo cliente** (o coração ❤️ do molde) — aqui ninguém escolhe fotos
  para edição.
- **Original da câmera** — decisão consciente de entregar 2048px.
- **Domínio próprio** — nesta arquitetura ele é só cosmético. O `.pages.dev` já tem banda
  e requisições ilimitadas para as fotos.

---

## Fontes

- [Cloudflare Pages — limites](https://developers.cloudflare.com/pages/platform/limits/) (20.000 arquivos, 25 MB cada, no plano grátis)
- [Cloudflare Pages Functions — pricing](https://developers.cloudflare.com/pages/functions/pricing/) ("requests to static assets are free and unlimited")
- [Cloudflare Workers — pricing](https://developers.cloudflare.com/workers/platform/pricing/) (100k req/dia; D1 e Workers sem cartão)
- [R2 exige método de pagamento mesmo no plano grátis](https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179) — **o motivo de o R2 estar fora**
- [Zero Trust / Access — plano grátis](https://zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026/) (50 usuários)
- [Limites do plano grátis do Supabase em 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) (1 GB de arquivos, pausa em 7 dias)

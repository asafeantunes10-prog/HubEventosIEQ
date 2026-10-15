# Hub de Fotos da Igreja — instruções para o Claude

Leia isto antes de qualquer coisa. O plano completo está em `PLANO.md`, na raiz — ele é a
fonte da verdade sobre o **que** construir. Este arquivo diz **onde o trabalho parou** e
**o que não pode ser feito**.

---

## Onde retomar

> Mantenha esta seção atualizada. Ao terminar uma etapa, mova a linha e diga o que ficou
> pronto. É o único lugar que responde "continue" sem o histórico da conversa.

**Etapa 1 (Fundação) — concluída.** Vite + React + TS, Tailwind v4 CSS-first, design
system trazido do molde e limpo, repositório próprio, banco D1 criado e migrado (local e
remoto).

**Etapa 2 (Script de publicação) — concluída.** `scripts/publicar.mjs` faz o caminho
inteiro: processa, grava no D1, limpa órfãos, escreve um espelho `fotos.json`, constrói e
publica (`scripts/d1.mjs` isola a conversa com o banco). Retomável de verdade.

**Etapa 3 (Leitura pública) — concluída.** `functions/api/eventos.ts` (lista para a home,
com a capa resolvida por `coalesce(capa_id, primeira foto)`) e
`functions/api/eventos/[slug].ts` (evento + todas as fotos, sem paginação — não há mais
quota de requisição a economizar). `src/lib/api.ts` traduz as linhas do D1 (`snake_case`,
booleano como 0/1) para os tipos de `tipos.ts`; nenhuma tela vê uma coluna do banco.
`Home.tsx` busca e mostra a grade (`CartaoEvento.tsx`); `Evento.tsx` liga `GradeFotos` +
`Visualizador` + download por foto (via `baixarUma` de `zip.ts` — o botão "baixar tudo"
em ZIP é etapa 4). `cor_destaque` já injeta `--primary` no wrapper da página do evento.

Confirmado no ar: `/api/eventos` e `/api/eventos/:slug` respondem, 404 funciona, e as
fotos continuam vindo de `/fotos/...` como assets estáticos — nenhuma delas passa por
Function. `functions/tsconfig.json` (não entra no `tsc -b` da raiz; rode
`npm run tipos:functions`) foi criado para as Functions terem checagem de tipo antes do
deploy — o `wrangler pages deploy` compila `functions/` com o próprio esbuild e não lê
tsconfig nenhum, então sem isso um erro de tipo ali só apareceria em produção.

O evento de teste (`culto-de-teste-2026`) foi **publicado** para essa verificação — é o
que está no ar agora em https://eventos-ieq.pages.dev. É dado de teste; despublicar ou
apagar fica a critério do Asafe (pelo D1 direto, já que o painel ainda não existe).

**Etapa 4 (Download) — concluída.** `src/components/galeria/BaixarTudo.tsx` liga o
`baixarEventoEmZip` que já existia em `zip.ts` a uma tela: botão com progresso
(`concluídas/total`), barra e cancelamento via `AbortController`. Só aparece quando
`evento.permiteZip` é verdadeiro. Download individual (cartão e visualizador) já vinha da
etapa 3.

Testado de ponta a ponta contra o site publicado: busquei as 6 fotos reais de
`https://eventos-ieq.pages.dev/fotos/...` com `client-zip` fora do navegador (mesma
biblioteca, mesmo fluxo) e o ZIP resultante abriu com `unzip -t` sem erro, 6 arquivos,
tamanhos batendo com as versões `-g`. O que não foi possível testar aqui — sem um
Chrome/Firefox de verdade disponível — é o caminho `showSaveFilePicker` vs. o de queda para
Blob, e o clique real no botão "Cancelar" a meio de um download. A lógica dos dois foi
revisada com cuidado (inclusive a distinção entre "a pessoa fechou o diálogo de salvar" e
"o cancelamento pelo botão abortou o fetch", que precisavam parecer a mesma coisa na
tela), mas **vale um teste manual no navegador** antes de divulgar o site.

**Etapa 5 (Painel admin) — concluída, incluindo a proteção.** As telas (`PainelEventos`,
`NovoEvento`, `EditarEvento`) e a API completa (`functions/api/admin/eventos.ts`,
`.../eventos/[id].ts`, `.../eventos/[id]/fotos.ts`) estão escritas e testadas.

**O Cloudflare Access saiu do projeto.** Criar a equipe no Zero Trust pede cartão de
crédito mesmo escolhendo o plano gratuito — o Asafe confirmou isso na prática, mesmo
motivo que já tinha tirado o R2. No lugar: **uma senha única**, sem conta por pessoa.

- `functions/lib/senha.ts` — hash **PBKDF2-HMAC-SHA256 com só 5.000 iterações**, calibrado
  contra o teto real de 10ms de CPU das Pages Functions (medido no runtime de verdade via
  `wrangler pages dev`: 5.000 iterações ≈ 4ms; 100.000 ≈ 65ms, estouraria o teto e mataria
  a própria requisição de login). Por isso a segurança aqui depende do **tamanho da
  senha**, não do custo do hash — `scripts/gerar-senha.mjs` sorteia 20 caracteres por
  padrão. O número de iterações fica gravado dentro do próprio hash
  (`pbkdf2:<n>:<sal>:<hash>`), então gerar e verificar nunca podem discordar.
- `functions/lib/sessao.ts` — cookie de sessão assinado por HMAC (`HttpOnly`, `Secure`,
  `SameSite=Strict`), 7 dias.
- `functions/api/login.ts` — a única porta de entrada, com **limitador por IP no D1**
  (tabela `tentativas_login`, migração `0002`): 10 tentativas erradas por 15 minutos, e
  isso vale mesmo que a 11ª tentativa acerte a senha.
- `functions/api/admin/_middleware.ts` continua **fechado por padrão**: sem
  `SENHA_HASH`/`SESSAO_SEGREDO` (secrets — nunca em `wrangler.toml`, nunca no git),
  `/api/admin/*` inteiro volta 503.
- `scripts/gerar-senha.mjs` gera os dois secrets. Já rodei uma vez: os secrets estão
  configurados em produção (`wrangler pages secret put`), e a senha foi mostrada ao Asafe
  uma única vez para ele guardar num gerenciador de senhas — **ninguém mais tem acesso a
  ela**, nem este arquivo. Trocar a senha no futuro é rodar o script de novo com o novo
  valor.

**Testado de ponta a ponta duas vezes** — primeiro local (`wrangler pages dev` com
`.dev.vars`), depois **contra o próprio site publicado**, já com os secrets reais: sem
cookie barra (401), senha errada barra (401), 10 erradas + a 11ª (mesmo que certa) barra
(429, só testado local para não sujar o limitador de produção à toa), senha certa entrega
um cookie que a API aceita (200), logout apaga o cookie e a chamada seguinte volta a
barrar (401). O único jeito de validar esse último passo direito foi usar um jar de cookie
de verdade (`curl -b arquivo -c arquivo`, lendo E escrevendo) — só com `-b` o teste mentia
"continua autenticado" porque o curl nunca aplicava o `Set-Cookie` da resposta.

Um `405` isolado apareceu numa tentativa de login logo depois do deploy; a mesma chamada,
repetida na hora, respondeu 204 certinho, e o ciclo inteiro (login → sessão → logout →
barrado de novo) rodou limpo em seguida. Parece o mesmo tipo de soluço passageiro do `7403`
já registrado acima — não reproduziu numa segunda tentativa.

**Reordenar fotos é por botão (subir/descer), não arrastar** — decisão deliberada:
drag-and-drop é ruim no toque de celular, e é de celular que o plano pede para o painel
funcionar.

Um erro `7403` isolado do D1 remoto ("account not authorized") apareceu uma vez durante um
deploy desta etapa; rodar de novo, sem mudar nada, resolveu. Parece soluço passageiro da
API da Cloudflare, não escopo de token (`d1 (write)` aparece em `wrangler whoami`) nem bug.
Registrando caso se repita: se um comando do wrangler (hoje `npm run migrar` ou `implantar`) falhar com `7403`, rode de novo antes de
suspeitar de outra coisa.

**Etapa 6 (Compartilhamento e acabamento) — concluída.** Meta tags OG de verdade, 404 real
(página E status HTTP), `robots.txt`, o script de arquivamento e o README.

- `functions/_middleware.ts` (novo — o primeiro middleware fora de `admin/`, na raiz do
  site) roda para todo caminho que não seja `/api/*` e faz duas coisas:
  - Em `/e/:slug`, reescreve `<title>`, `og:title`, `og:description` e
    `meta[name=description]` via HTMLRewriter, e ACRESCENTA `og:url`, `og:image` e
    `twitter:image` (o `index.html` estático nunca teve tag de imagem — não havia o que
    substituir, só acrescentar). A imagem vem de `urlFoto()` — o mesmo `src/lib/fotos.ts`
    que as telas usam, importado direto de dentro de `functions/` atravessando os dois
    `tsconfig` — com origem absoluta (`new URL(..., url.origin)`), porque OG exige URL
    completa. `npm run tipos:functions` confirma que essa importação atravessando a
    fronteira tipa limpo.
  - Em QUALQUER caminho que não bate com nenhuma rota conhecida (a mesma lista que
    `src/App.tsx` declara — as duas precisam concordar), troca o status da resposta para
    404 de verdade, mantendo o mesmo corpo. Resolve o bug já registrado aqui: antes, todo
    caminho inválido caía no fallback de SPA do Pages com status 200 e o React Router não
    renderizava nada — tela em branco. Agora existe uma rota coringa
    (`src/pages/NaoEncontrada.tsx`, `path="*"` em `App.tsx`) que aparece nos dois casos
    (rota que não existe, ou `/e/:slug` de um evento que não existe/não está publicado), e
    o cabeçalho HTTP conta a mesma história para quem não é humano (bot, ferramenta de
    prévia de link).
  - `/fotos/*` continua fora disto: o Pages exclui pasta de asset estático do roteamento
    de Functions antes de consultar qualquer coisa, então nenhuma foto passa por aqui —
    confirmado batendo direto num arquivo apagado (404 de verdade, sem o middleware).

- **Achado no meio do caminho, fora do que o plano pedia:** `arquivado` (a flag que
  `arquivar.mjs` liga) só mexia no banco — nenhuma tela sabia disso. Como o visualizador e
  o ZIP sempre pediam a versão `-g`, um evento arquivado mostraria IMAGEM QUEBRADA em tela
  cheia, não só um download que falha. Corrigido: `Evento.tsx` calcula
  `temVersaoGrande = !evento.arquivado` e repassa para `GradeFotos` → `CartaoFoto`
  (esconde o botão de baixar a foto avulsa), `Visualizador` (esconde o botão de baixar E
  troca a imagem principal para a versão `-t`, a única que sobra) e esconde `BaixarTudo`
  inteiro. O `og:image` do middleware faz o mesmo: usa `-t` quando `arquivado`, para o
  link continuar tendo prévia em vez de imagem quebrada.

- `scripts/arquivar.mjs` (novo): apaga as versões `-g` de um evento e marca
  `arquivado = 1`. **Simulação por padrão** — sem `--confirmar` só mostra quantas fotos e
  quantos MB seriam apagados; nada muda no disco nem no banco. Com `--confirmar`, apaga,
  atualiza o banco, reescreve o `fotos.json` (espelho) e publica de novo — os mesmos três
  passos finais de `publicar.mjs`. Isso puxou um refactor: a cauda que os dois scripts
  compartilham (`popularDistComFotos`, `projetoPagesExiste`, `publicarNoPages`,
  `escreverEspelho`, `contarArquivosDoSite`, as constantes de caminho) saiu de
  `publicar.mjs` para `scripts/implantar.mjs`. Nenhuma lógica mudou, só o lugar —
  `publicar.mjs` ficou mais curto e importa de lá.

- `public/robots.txt` (novo): bloqueia `/admin` e `/api/admin`. Nada lá que valha aparecer
  numa busca, e a senha já protege de verdade — isto é só para não ver "Painel
  administrativo" indexado ao lado das fotos dos eventos.

- `README.md` (novo, na raiz): como publicar um evento, como arquivar, como trocar a
  senha, o aviso sobre o backup de `fotos/`, os comandos e o passo de
  `npm approve-scripts` numa máquina nova. Este arquivo continua sendo o histórico
  técnico; o README é para quem só quer usar o site pronto.

- **Deliberadamente fora desta etapa:** `manifest.webmanifest`. Exigiria ícones (192px,
  512px) que ainda não existem — o projeto não tem identidade visual própria ainda (fica
  para depois, com o tema do molde por enquanto). Um manifesto sem ícone de verdade seria
  só um arquivo a mais sem efeito prático.

**Testado com dados sintéticos no D1 LOCAL** (um evento e duas fotos falsas, nunca tocou
produção) via `wrangler pages dev`: rotas conhecidas em 200, rota inválida em 404, `/e/:slug`
de evento inexistente em 404 com corpo intacto, tags OG corretas. Depois de arquivar de
verdade (`--local --confirmar`): arquivos `-g` sumiram do disco, `-t` sobreviveram, banco
com `arquivado=1`, espelho reescrito, e a mesma página passou a usar `-t` no `og:image`.
Dados de teste apagados do banco local e do disco em seguida.

**Depois, contra o site publicado** (sem tocar fotos nem D1 de produção — só `tsc -b`,
`vite build` e `wrangler pages deploy dist`, reaproveitando o `culto-de-teste-2026` já no
ar): `/`, `/admin` e `/admin/eventos/:id` em 200; caminho inválido em 404; o evento real com
as três tags OG certas e a imagem respondendo 200 de verdade; um slug inexistente em 404 com
o corpo do SPA intacto; `robots.txt` servindo; `/api/eventos` e `/api/admin/sessao`
inalterados (o middleware novo não entra no caminho de `/api/*`).

Mais um soluço passageiro do mesmo tipo já registrado duas vezes acima (`7403`, `405`): logo
após o deploy, uma rota inválida respondeu 200 (o comportamento ANTIGO) numa única
tentativa; a mesma rota, e outras novas, responderam 404 correto segundos depois —
propagação do deploy pelos PoPs da Cloudflare, não um bug de lógica.

**Etapa 7 (Envio de fotos pelo painel + RAW) — código pronto e testado; falta a configuração
do Asafe.** Reverte, a pedido dele (outubro de 2026, para os próximos eventos), a decisão da
etapa 1 de "sem upload pelo navegador". Motivos e achados:

- **Por que as fotos mudaram de casa.** Foto nova só entra no ar por um deploy do Pages, e
  um deploy feito por API (de dentro de uma Function) não leva o código das Functions — o
  site perderia o servidor. Então as fotos moram num **segundo projeto Pages**,
  `eventos-ieq-fotos` (só estáticos, sem Function), e o site (`eventos-ieq`) não carrega mais
  foto nenhuma. `urlFoto()` em `src/lib/fotos.ts` agora devolve URL absoluta
  (`https://eventos-ieq-fotos.pages.dev/fotos/...`); `fetch` de foto (ZIP, `baixarUma`) depende
  do CORS do `_headers` desse projeto (`functions/lib/cabecalhosFotos.ts`).
- **O processamento é no navegador**, em Web Workers (`src/lib/envio/`): lê o arquivo local
  (JPEG/PNG/WebP/RAW), gira pelo EXIF, reduz (g = **lado maior** de 2048 px; t = 400 px de
  largura; nunca amplia), codifica WebP com `@jsquash/webp` (libwebp em WASM — o
  `canvas.toBlob('image/webp')` devolve PNG no Safari) e sobe só isso (~250 KB a 500 KB por
  foto). O servidor não teria como (10 ms de CPU).
- **As Functions só repassam e orquestram** (`functions/api/admin/armazenamento/`): `enviar`
  repassa o lote em stream para `/pages/assets/upload` (a API do Cloudflare **não** libera
  CORS para navegador); `publicar` monta o manifesto **concatenando texto gerado no SQL**
  (`functions/lib/publicacao.ts` — interpretar 20.000 entradas estouraria os 10 ms), chama
  `upsert-hashes` e cria o deployment; `estado` devolve o uso do limite e fecha o
  deployment. O protocolo é o do `wrangler pages deploy` (`blake3(base64 + extensão)`, 32
  hexa; conferido contra o `blake3-wasm` do wrangler em `hashPages.test.ts`).
- **Estados de uma foto (`fotos.no_ar`):** 0 registrada e fora do ar, 2 num deploy em
  andamento, 1 no ar. A API pública só devolve `no_ar = 1`, para nunca apontar para arquivo
  que ainda não existe. `publicar` **recusa** (409) se alguma foto no ar não tiver hash:
  um deploy do Pages SUBSTITUI o site anterior e uma foto sem hash sumiria sem erro
  (`group_concat` pula NULL em silêncio).
- **RAW** (`src/lib/envio/decodificarRaw.ts`, `@colorhythm/libraw-wasm`, LibRaw 0.22.1):
  usa a **prévia JPEG embutida**, que nas amostras reais (Sony FX30 ARW, Canon R6/R7 CR3,
  5D IV CR2) vem em **tamanho cheio** e com o visual da câmera; só revela o RAW em meia
  resolução quando a prévia tem menos de 2048 px (avisa na linha do arquivo). A orientação
  vem do `flip` da LibRaw (EXIF 8 = flip 5; 6 = 6; 3 = 3) e só deixa de ser aplicada se o
  JPEG embutido trouxer uma própria diferente de 1 — as prévias declaram 1 mesmo em foto
  vertical. **Edições do Lightroom/Camera Raw (`.xmp`, catálogo) não aparecem** — o Asafe
  confirmou que o RAW é para fotos "puras" e as editadas saem em JPEG.
- **Achados que custaram caro, para não repetir:**
  - O **Chrome ignora `imageOrientation: 'none'`** e gira sozinho (medido, v155). Girar de
    novo estraga a foto. `navegadorGira.ts` detecta o comportamento com um JPEG de 2x1
    px e orientação 6; nunca suponha.
  - O **Firefox decodifica JPEG truncado pela metade**, sem erro; o Chrome recusa.
    `jpeg.ts` confere o EOI (`FF D9`) em qualquer navegador.
  - O WebKit do Playwright no Windows **não tem `OffscreenCanvas`** (o Safari 16.4+ tem).
    O painel detecta e avisa (`suporte.ts`); **Safari de verdade nunca foi testado**.
  - Um teste que envia zero fotos passa por engano (`0 === 0`); asserte a contagem.
- **Como foi testado:** Chrome 155 e Firefox, de verdade, via Playwright, contra
  `wrangler pages dev` (D1 local) + um servidor que imita a API do Pages e **valida os
  hashes como a Cloudflare faria** (`CF_API_BASE` no `.dev.vars` aponta para ele).
  Cenários: 10 imagens sintéticas com orientações 1/2/3/6/8, PNG, WebP, um JPEG de 26 MP,
  arquivos que devem ser recusados; 9 RAW reais (amostras de raw.pixls.us, 4 com a tag de
  orientação adulterada para simular foto vertical); cancelar e retomar sem duplicar,
  deploy recusado, trava de hash, apagar foto, arquivar. Tudo passou, ~1 s por foto com 3
  workers. Esse harness era descartável e **não está no repo**; os testes do repo são os
  unitários (`npm test`).
- **Aposentados:** `npm run publicar`, `npm run arquivar` e o `fotos.json` espelho. Arquivar
  virou botão no painel (`PATCH arquivado` + deploy). A dependência `sharp` saiu. `scripts/d1.mjs`
  fica só até o Asafe confirmar a migração (`scripts/migrar-fotos.mjs` o usa).

**O que ainda depende do Asafe, em ordem** (tudo sem cartão; passo a passo no README, seção
"Configurar o envio de fotos"):
1. `npx wrangler pages project create eventos-ieq-fotos --production-branch=main`
2. Criar o token de API (Conta → Cloudflare Pages → Editar) e gravar `CF_API_TOKEN` e
   `CF_ACCOUNT_ID` com `wrangler pages secret put`.
3. `npm run migrar` → `npm run migrar-fotos` → `npm run implantar`, **nessa ordem** (as fotos
   passam a existir no projeto novo antes de o site apontar para lá).
4. Testar de verdade: enviar uma pasta com RAW da FX30 e da Canon pelo painel e conferir a
   orientação das verticais (as amostras reais que testei eram todas horizontais; a vertical
   foi simulada). Abrir o painel num Mac/Safari, se houver um à mão.
5. Depois de a migração estar confirmada, remover `scripts/d1.mjs` e `scripts/migrar-fotos.mjs`
   (e o `migrar-fotos` do `package.json`).

**Riscos que só a produção responde:** (a) a doc do Pages cita 500 *builds*/mês e não diz se
*direct upload* conta — um deploy por sessão de envio, nunca um por foto; (b) o CPU de 10 ms
do `publicar` com um site cheio (20.000 entradas) foi só estimado, não medido no runtime
real; (c) uma foto apagada só sai do ar no deploy seguinte.

**Checklist final do `PLANO.md`, ainda aberta** (não é uma etapa): publicar um evento de verdade com ~500 fotos e conferir a contagem de
arquivos no painel do Pages; abrir o link no celular em rede móvel (não Wi-Fi); baixar uma
foto e o ZIP completo no celular; colar o link de um evento no Instagram e no WhatsApp e
ver a prévia **de verdade** (o servidor já entrega a tag certa e a imagem responde 200 —
falta só alguém com WhatsApp/Instagram confirmar o resultado); criar/editar um evento pelo
painel a partir do celular.

### Pendência pequena, herdada da etapa 1

O teste de independência literal (renomear `c:\Projetos\LandingPageAS`) nunca rodou: o
VS Code mantém a pasta aberta e trava o rename. A prova equivalente passou — `npm ci &&
npm run build` numa cópia fora de `c:\Projetos`. Se a pasta estiver livre, rode o teste do
plano e risque este item.

---

## Regras invioláveis

### 1. Nada neste projeto pede cartão de crédito

O Asafe não tem cartão disponível. Isso é restrição dura, não preferência.

**O Cloudflare R2 está fora do projeto** porque exige cartão mesmo no plano grátis.
**O Cloudflare Access também está fora**, pelo mesmo motivo: criar a equipe no Zero Trust
pede cartão mesmo escolhendo o plano gratuito — confirmado na prática. Se a solução mais
óbvia para um problema parecer "põe no R2" ou "usa o Access" — ou qualquer serviço que peça
cartão na ativação — **pare e diga isso a ele**. É o caminho errado.

Pages, Pages Functions e D1 não pedem cartão. É com isso que se trabalha. O painel admin é
protegido por uma senha própria (`functions/api/login.ts`), não por Access — ver a etapa 5
em "Onde retomar". O token de API do envio de fotos (etapa 7) também não pede cartão.

### 2. Este projeto é independente de `c:\Projetos\LandingPageAS`

Aquele projeto foi **molde**, aberto uma única vez na etapa 1 para copiar arquivos. O
vínculo está cortado e não volta.

Proibido: `import` que saia da pasta, alias de TS ou Vite apontando para fora, `link:` ou
`file:` no `package.json`, symlink, submódulo, ou qualquer recurso de conta compartilhado.
**Nunca abra aquela pasta.** Se precisar de algo que existe lá, escreva do zero aqui.

### 3. Pare nas ações que dependem do Asafe

Criar conta, `wrangler login`, criar projeto Pages — tudo que exige navegador ou decisão
dele. Diga exatamente o que fazer e espere. Não contorne.

Isso vale também para o que a etapa 7 deixou pendente: criar o projeto `eventos-ieq-fotos`
e o token de API (`CF_API_TOKEN`, `CF_ACCOUNT_ID`) são ações dele, no navegador/terminal
dele — imprima os comandos e espere.

O Cloudflare Access **não faz mais parte do plano** (ver a regra 1) — não peça para o
Asafe configurar Access. A senha do painel já está gerada e configurada
(`SENHA_HASH`/`SESSAO_SEGREDO`, secrets na Cloudflare); trocá-la é rodar
`npm run gerar-senha` e aplicar os dois comandos que ele imprime.

### 4. Convenção de idioma

- **Texto que aparece na tela:** português correto, com acento.
- **Código, nomes de arquivo, variáveis e comentários:** português sem acento, ASCII.
- **Comentários explicam POR QUÊ, não O QUÊ.**

Isso vale para todo arquivo novo. Os arquivos existentes seguem essa convenção — mantenha.

---

## A arquitetura em cinco linhas

As fotos **não** ficam num serviço de armazenamento: são **arquivos estáticos de um segundo
projeto Pages** (`eventos-ieq-fotos`, sem Functions), atualizado pelo painel por API.
Requisição a asset estático no Cloudflare Pages é grátis e ilimitada — some o teto de 100
mil requisições/dia e some o risco de um ZIP de 500 fotos comer meia quota. O D1 guarda só
metadados (e o hash de cada arquivo, que o deploy exige). O gargalo é **contagem de
arquivos: 20.000 por projeto**, e é por isso que cada foto tem duas versões, não três.
Quem processa a foto é o **navegador de quem envia** — nenhum original, e muito menos RAW,
passa pelo servidor.

**`urlFoto()` em `src/lib/fotos.ts` é o único lugar do código que sabe de onde vem uma
foto.** O banco guarda `culto-jovens-2026/a1b2`, sem sufixo nem extensão. Foi isso que fez
a mudança para o segundo projeto custar uma linha. Não espalhe montagem de URL pelas telas.

**Um deploy do Pages SUBSTITUI o anterior.** O que faltar no manifesto some do ar. Por isso o
manifesto sai sempre do banco, e por isso o painel recusa publicar com foto sem hash.

---

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build            # tsc -b && vite build
npm run lint             # oxlint
npm test                 # testes unitarios (node --test); os e2e nao estao no repo
npm run tipos:functions  # checagem de tipos das Functions (fora do tsc -b)
npm run implantar        # constroi e publica o SITE (as fotos nao vao junto)
npm run migrar-fotos     # uso unico, da etapa 7 (ver "Onde retomar")
npm run migrar:local     # aplica as migrations no D1 local
npm run migrar           # aplica no D1 remoto (producao)
```

Numa máquina nova, depois do `npm install`, rode `npm approve-scripts esbuild` e
`npm approve-scripts workerd` — sem isso os dois ficam sem binário e nem o Vite nem o
Wrangler funcionam. O erro que aparece não deixa isso claro.

---

## Armadilhas conhecidas

- **As fotos do site são versões leves e só existem na Cloudflare.** O backup real são os
  RAW/JPEG que a equipe já guarda — enviar a pasta de novo as recria. A pasta `fotos/` do
  PC só importa até a migração (`npm run migrar-fotos`); depois não é mais usada.
- **Não rode `npm run migrar-fotos` depois que o painel recebeu fotos.** Ele faz um deploy só
  com o que há em `fotos/` e apagaria as do painel; por isso ele mesmo se recusa
  (`chave_origem` não nula) — não remova essa trava.
- **No D1 remoto, consulta tem que ir por `--command`, nunca por `--file`.** Com arquivo,
  o wrangler trata como importação em lote e devolve um **resumo** ("Total queries
  executed", "Rows read") dentro do campo `results`, no lugar das linhas. Quem espera as
  linhas recebe um objeto com forma de linha e campos outros, e o erro só aparece muito
  depois — no caso real, como `NOT NULL constraint failed: fotos.evento_id` depois de
  processar todas as fotos. `consultar()` em `scripts/d1.mjs` já usa `--command` e tem uma
  guarda que falha na hora se o resumo voltar. No `--local` isso não acontece, então o bug
  só aparece contra produção.
- **Ordem do deploy importa.** Para qualquer mudança que mexa em `urlFoto()` ou no manifesto,
  as fotos precisam existir no destino ANTES de o site apontar para lá (foi a ordem da
  migração). E `wrangler pages dev` com Functions só mexe no D1 local — use `CF_API_BASE`
  para não tocar na conta real.
- **O lint tem dois avisos permanentes** — `set-state-in-effect` em `Imagem.tsx` (o caso
  da imagem em cache, explicado no comentário) e `only-export-components` em `button.tsx`
  (padrão do shadcn). São conhecidos. Não "conserte" nenhum dos dois.
- **Antes de trocar de máquina, `git push`.** O remoto se chama `Trabalho`. Um commit
  esquecido aqui vira, do outro lado, um erro que parece de credencial.

---

## Fora de escopo, de propósito

R2 e qualquer serviço com cartão · marca d'água · reconhecimento facial (o Asafe pediu, ficou para depois do envio) · PIN ou
login de visitante · seleção de fotos pelo cliente · o original da câmera · domínio próprio
· qualquer vínculo ou peça de marca do projeto que serviu de molde.

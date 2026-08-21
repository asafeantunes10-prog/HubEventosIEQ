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
  ela**, nem este arquivo. Trocar a senha no futuro é rodar o script nomo com o novo valor.

**Testado de ponta a ponta contra o site publicado**, não só em teoria: sem cookie barra
(401), senha errada barra (401), 10 erradas + a 11ª (mesmo que certa) barra (429), senha
certa entrega um cookie que a API aceita (200), logout apaga o cookie e a chamada seguinte
volta a barrar (401). O único jeito de validar esse último passo direito foi usar um jar de
cookie de verdade (`curl -b arquivo -c arquivo`, lendo E escrevendo) — só com `-b` o teste
mentia "continua autenticado" porque o curl nunca aplicava o `Set-Cookie` da resposta.

**Reordenar fotos é por botão (subir/descer), não arrastar** — decisão deliberada:
drag-and-drop é ruim no toque de celular, e é de celular que o plano pede para o painel
funcionar.

Um erro `7403` isolado do D1 remoto ("account not authorized") apareceu uma vez durante um
deploy desta etapa; rodar de novo, sem mudar nada, resolveu. Parece soluço passageiro da
API da Cloudflare, não escopo de token (`d1 (write)` aparece em `wrangler whoami`) nem bug.
Registrando caso se repita: se `npm run publicar` falhar com `7403`, rode de novo antes de
suspeitar de outra coisa.

**Próxima: etapa 6 — compartilhamento e acabamento.** Meta tags OG por evento via
HTMLRewriter, `robots.txt`, página 404 de verdade (ver o item abaixo) e o README.

**Conhecido e adiado para a etapa 6:** uma rota que não bate com nenhuma rota declarada
(`/`, `/e/:slug`, `/admin`, `/admin/eventos/novo`, `/admin/eventos/:id`) cai no fallback de
SPA do Pages (recebe o `index.html`, status 200) e o React Router não renderiza nada —
tela em branco. A página 404 de verdade está na lista da etapa 6.

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
em "Onde retomar".

### 2. Este projeto é independente de `c:\Projetos\LandingPageAS`

Aquele projeto foi **molde**, aberto uma única vez na etapa 1 para copiar arquivos. O
vínculo está cortado e não volta.

Proibido: `import` que saia da pasta, alias de TS ou Vite apontando para fora, `link:` ou
`file:` no `package.json`, symlink, submódulo, ou qualquer recurso de conta compartilhado.
**Nunca abra aquela pasta.** Se precisar de algo que existe lá, escreva do zero aqui.

### 3. Pare nas ações que dependem do Asafe

Criar conta, `wrangler login`, criar projeto Pages — tudo que exige navegador ou decisão
dele. Diga exatamente o que fazer e espere. Não contorne.

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

As fotos **não** ficam num serviço de armazenamento: são **arquivos estáticos do próprio
site**, em `/fotos/...`, publicados junto com ele. Requisição a asset estático no Cloudflare
Pages é grátis e ilimitada — some o teto de 100 mil requisições/dia e some o risco de um
ZIP de 500 fotos comer meia quota. O D1 guarda só metadados. O gargalo passa a ser
**contagem de arquivos: 20.000 por site**, e é por isso que cada foto tem duas versões, não
três.

**`urlFoto()` em `src/lib/fotos.ts` é o único lugar do código que sabe de onde vem uma
foto.** O banco guarda `culto-jovens-2026/a1b2`, sem sufixo nem extensão. Mantenha assim:
é o que torna barata uma migração futura. Não espalhe montagem de URL pelas telas.

---

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build            # tsc -b && vite build
npm run lint             # oxlint
npm run publicar "<pasta>"   # processa as fotos de um evento
npm run migrar:local     # aplica as migrations no D1 local
npm run migrar           # aplica no D1 remoto (producao)
```

Numa máquina nova, depois do `npm install`, rode `npm approve-scripts esbuild` e
`npm approve-scripts workerd` — sem isso os dois ficam sem binário e nem o Vite nem o
Wrangler funcionam. O erro que aparece não deixa isso claro.

---

## Armadilhas conhecidas

- **`fotos/` está fora do git e não tem backup automático.** É onde moram os únicos
  originais processados. Se ela se perder, não há de onde republicar. Sempre que o assunto
  encostar nisso, lembre o Asafe da cópia no HD externo ou no Drive.
- **No D1 remoto, consulta tem que ir por `--command`, nunca por `--file`.** Com arquivo,
  o wrangler trata como importação em lote e devolve um **resumo** ("Total queries
  executed", "Rows read") dentro do campo `results`, no lugar das linhas. Quem espera as
  linhas recebe um objeto com forma de linha e campos outros, e o erro só aparece muito
  depois — no caso real, como `NOT NULL constraint failed: fotos.evento_id` depois de
  processar todas as fotos. `consultar()` em `scripts/d1.mjs` já usa `--command` e tem uma
  guarda que falha na hora se o resumo voltar. No `--local` isso não acontece, então o bug
  só aparece contra produção.
- **Retomar pode deixar arquivo órfão.** Se o script cair depois de gravar os WebP e antes
  de gravar no banco, a execução seguinte reprocessa aqueles originais com identificadores
  novos e os antigos ficam para trás — invisíveis no site, mas ocupando lugar no teto de
  20.000. `limparOrfaos()` apaga todo WebP sem linha no banco, ao fim de cada execução.
- **O lint tem dois avisos permanentes** — `set-state-in-effect` em `Imagem.tsx` (o caso
  da imagem em cache, explicado no comentário) e `only-export-components` em `button.tsx`
  (padrão do shadcn). São conhecidos. Não "conserte" nenhum dos dois.
- **Antes de trocar de máquina, `git push`.** O remoto se chama `Trabalho`. Um commit
  esquecido aqui vira, do outro lado, um erro que parece de credencial.

---

## Fora de escopo, de propósito

R2 e qualquer serviço com cartão · upload de foto pelo navegador · marca d'água · PIN ou
login de visitante · seleção de fotos pelo cliente · o original da câmera · domínio próprio
· qualquer vínculo ou peça de marca do projeto que serviu de molde.

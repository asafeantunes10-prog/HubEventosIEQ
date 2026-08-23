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
Registrando caso se repita: se `npm run publicar` falhar com `7403`, rode de novo antes de
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

### Extensões pós-etapa 6 (fora do plano original, pedidas depois)

**Apagar foto avulsa.** `DELETE /api/admin/eventos/:id/fotos/:fotoId`
(`functions/api/admin/eventos/[id]/fotos/[fotoId].ts`) apaga a linha da foto, tira ela da
capa se era a escolhida, e recalcula `total_fotos` — os três num `batch` só. Mesma ressalva
do apagar evento (etapa 5): **não apaga o arquivo do disco nem do site publicado**, só o
registro no D1 — o `.webp` fica órfão até o próximo `npm run publicar` (de qualquer evento)
rodar `limparOrfaos()`. Existe para corrigir engano (foto errada que entrou junto num lote),
não para curadoria. Na tela (`GerenciarFotos.tsx`, dentro de `EditarEvento.tsx`), um ícone de
lixeira por miniatura, confirmação por `window.confirm` (não um `Dialog` — com centenas de
fotos na grade, um por miniatura seria pesado para um clique que precisa ser rápido).

**Identidade visual chegou.** As primeiras peças (brasão do Diaconato, selo da Quadrangular
MS, logo do Grupo Missionário de Homens) vieram do Asafe e substituem o placeholder que
`index.css` descrevia como provisório. Decisão, depois de três rodadas de prévia num
Artifact: continua **tema único, escuro** (a regra original se mantém — só a cor mudou), mas
agora com identidade de verdade:
- `.fundo-identidade` (novo, em `index.css`): o fundo da home — os quatro tons tirados do
  brasão do Diaconato (vermelho, dourado, azul, roxo) em brilhos suaves nos quatro cantos,
  sobre uma base bem escura. Aplicado num `<div>` que envolve o `<main>` da `Home.tsx`, para
  cobrir a tela inteira (o `<main>` sozinho é centralizado e não tem a largura da viewport).
- Selo pequeno da Quadrangular MS no cabeçalho da home, ao lado do texto "Igreja do Evangelho
  Quadrangular" — depois de uma tentativa maior (um "vitral" cônico nas quatro cores) não
  agradar, ficou provado que discreto funciona melhor aqui.
- `.fundo-evento` (novo): mesma lógica na página de um evento, mas com UM glow dominante
  controlado por `var(--primary)` — a MESMA variável que `cor_destaque` já sobrescrevia no
  wrapper de `Evento.tsx` desde a etapa 3. Não precisou mexer no schema nem no painel: quem
  já sabia usar `cor_destaque` já está usando o fundo novo. Um segundo glow fixo (vermelho
  fechado do brasão) dá o fio de identidade que se repete em todo evento.
- Os três arquivos originais (PNG/JPEG) estão em `src/assets/marca/` — só a Quadrangular MS
  está com uso real hoje (o selo do cabeçalho). GMH4 e o brasão do Diaconato foram
  incorporados ao repositório mas ainda NÃO aparecem em tela nenhuma: um banner combinando
  os dois, específico da página do evento "Diaconato", pede ou um schema novo (logos por
  evento não existem como coluna) ou um atalho grudado no slug — nenhum dos dois foi feito
  ainda, por decisão de escopo (ver conversa, não neste arquivo).

**Testado:** `npm run build`, `npm run tipos:functions` e `npm run lint` limpos; o CSS de
produção (`dist/assets/index-*.css`) confirmado com as classes novas depois do build; `npm
run dev` local respondeu 200 na home. **NÃO testado:** clique real no botão de apagar foto
contra o painel publicado, nem a home/evento nova num navegador de verdade (sem Chrome
disponível nesta sessão) — vale conferir visualmente antes de divulgar. **NÃO comitado, NÃO
publicado em produção** — o `git status` segue limpo do commit `6af726d` até alguém decidir
publicar isto.

**Nome de arquivo amigavel (`IMG_0001`, `IMG_0002`...).** `npm run publicar` gerava
`<id-aleatorio>-t.webp` / `-g.webp` — ilegivel pra quem abre a pasta `fotos/` na mao. Agora
o arquivo (e o `caminho` gravado no banco) usa um numero sequencial por evento
(`PREFIXO_ARQUIVO`/`DIGITOS_SEQUENCIA` em `scripts/publicar.mjs`), comecando em 1. O `id`
que e chave primaria da tabela `fotos` continua sendo o aleatorio de sempre — sao duas
identidades com papeis diferentes (comentario em `processarFoto` explica): `id` precisa ser
unico no BANCO INTEIRO e e o que o painel usa para apagar foto/capa; o numero amigavel so
precisa ser unico DENTRO da pasta do evento.

O numero vem de `eventos.proximo_numero_foto` (coluna nova, migracao
`0003_numero_amigavel.sql`) — GRAVADO, nunca recalculado por "maior numero que existe hoje".
Se fosse recalculado, apagar a foto de maior numero pelo painel (endpoint que ja existia,
ver "Apagar foto avulsa" acima) faria a proxima publicacao reaproveitar aquele numero para
um arquivo DIFERENTE — colisao de nome que um navegador com cache antigo mostraria errado.
O contador so cresce, avanca pelo total de arquivos TENTADOS (nao so os que deram certo, pra
uma falha no meio do lote nao deixar um numero livre pra reuso) e nunca reflete quantas
fotos existem agora — so quantas ja foram atribuidas.

**Testado local** (`--local`, fotos sinteticas, evento descartavel): numeracao comecando em
`IMG_0001`; rodar de novo sem fotos novas nao reprocessa nem avanca o contador (retomada
intacta); apagar a linha de `IMG_0003` do banco e do disco (simulando o endpoint do painel)
e publicar de novo — a foto seguinte virou `IMG_0004`, nunca reaproveitou `0003`. `npm run
build`, `tipos:functions` e `lint` limpos depois da mudanca. Dados de teste apagados do
banco local e do disco em seguida. Migracao aplicada no D1 local **e no remoto** (`npm run
migrar`, rodada em producao); eventos ja publicados nao precisaram de nenhum ajuste, o `id`
deles nao mudou, so fotos NOVAS depois da migracao ganham o nome bonito.

**Bug de verdade encontrado em producao, e corrigido: foto vertical saia deitada no
site.** Veio a tona publicando `diaconato-homens-2026` (evento real, ~100 fotos, primeira
vez que uma camera de verdade — nao WhatsApp — alimentou o pipeline). Causa: `sharp` nunca
girava o pixel pela tag `Orientation` do EXIF antes de redimensionar — uma foto tirada com a
camera vertical continua deitada nos bytes, so um FLAG separado no arquivo diz "gire 90 pra
mostrar certo", e nada em `processarFoto` (nem em `gerarLqip`) lia esse flag. Nao era erro
nenhum pro script — resize e webp funcionavam perfeitos na orientacao errada, silenciosos.
Corrigido com `.rotate()` (sem argumento, o sharp le a tag e gira sozinho) nos dois lugares;
a largura usada pra nunca ampliar (`Math.min(versao.largura, width)`) tambem precisou virar
`larguraEfetiva` — pra orientacao 5-8 (giro de 90/270) `width`/`height` do `metadata()` saem
TROCADOS em relacao ao que a foto vira depois de girada. Vale pra QUALQUER foto vertical
daqui pra frente, de qualquer camera — nao e algo especifico deste evento.

O mesmo evento expos outro buraco: **nao existia caminho pra fotos RAW (`.ARW`)**. `sharp`
nao decodifica RAW de camera (so imagem de verdade — JPEG, PNG, WebP, TIFF), entao um
`.ARW` na pasta era ignorado por `publicar.mjs` sem aviso nenhum — a contagem de fotos nao
mudava e nada explicava o motivo. `scripts/converter-raw.mjs` (novo, `npm run
converter-raw "pasta"`) resolve: toda foto RAW ja tem, embutida no proprio arquivo, uma
PREVIA em JPEG (o que a camera usa no visor) — o script extrai essa previa com o ExifTool E
copia a tag `Orientation` do `.ARW` pra dentro dela num segundo passo, porque a previa sai
SEM essa tag (ela mora so no arquivo original) — sem os dois passos juntos, a foto teria
saido deitada de novo, so que por um motivo diferente (tag ausente, nao tag ignorada). Nunca
apaga nem move o `.ARW`; se o `.jpg` ja existe, pula. ExifTool vendorizado em
`ferramentas/exiftool/` (fora do git, ver `.gitignore` — binario + runtime Perl de ~35 MB,
numa maquina nova o proprio script explica o que baixar e onde por).

**Incidente no meio do caminho: uma foto do evento foi perdida de verdade.** Durante o
diagnostico, um arquivo chamado `DSC07292.jpg` na pasta nao era uma previa gerada — era o
`.ARW` original renomeado a mao pelo Asafe pra `.jpg` (mesmo tamanho em bytes, `sharp` nao
conseguia abrir). Foi apagado por engano (`rm`, direto pelo terminal) achando que era
descartavel; nao foi pra Lixeira do Windows (delete por linha de comando pula ela), e nao
apareceu na Lixeira do OneDrive tambem. Sem conserto. Licao registrada aqui pra nao se
repetir: **nunca apagar um arquivo que possa ser a unica copia sem antes achar de onde ele
veio** — um `.jpg` do tamanho de um `.ARW` inteiro (~30 MB) e sinal de original renomeado,
nao de foto ja processada.

**Performance da grade com o evento cheio (537 fotos).** Depois do lote todo publicado, a
tela de `diaconato-homens-2026` ficou lenta pra carregar e algumas fotos apareciam como "Não
carregou". Conferido nos dois lados: `/api/eventos/:slug` responde em ~0,8s com 205 KB de
JSON (razoavel — nao e o gargalo); e as 537 fotos, nas duas versoes (`-t` e `-g`), TODAS
respondem 200 no site publicado (varredura completa, nao amostra) — ou seja, nao faltava
nenhum arquivo, o "Não carregou" era o navegador desistindo de fotos fora de tela num DOM de
537 cartoes, nao um 404 de verdade.

Corrigido em `CartaoFoto.tsx`: `content-visibility: auto` + `contain-intrinsic-size` no
`<figure>` de cada cartao. O `loading="lazy"` na imagem ja evitava 537 DOWNLOADS de uma vez
(so baixa o que esta perto da tela); isto faz o mesmo pro CSS — o navegador pula layout e
pintura dos cartoes fora de tela em vez de montar os 537 de uma vez so. `contain-intrinsic-
size: auto 320px` da um palpite de altura pro scroll nao pular antes de cada cartao ser
medido de verdade. `npm run build` e `lint` limpos; deploy conferido no dominio de producao
(o novo CSS respondeu 200 depois de alguns segundos de propagacao — o mesmo soluço
passageiro ja registrado antes, nao um erro).

**Glitch no celular, efeito colateral direto da otimizacao acima.** O `contain-intrinsic-
size: auto 320px` usava um palpite de altura FIXO pra todo cartao, ignorando a proporcao real
da foto. Cartao vertical e cartao horizontal tem alturas bem diferentes — ao rolar, cada
cartao saltava do palpite errado (320px) pro tamanho real assim que entrava na zona
renderizada do `content-visibility`, e como as fotos de um mesmo evento tendem a ter a mesma
orientacao em sequencia (o mesmo fotografo, o mesmo angulo, foto apos foto), o salto se
repetia visivelmente "corredor abaixo" — exatamente o que o Asafe descreveu. Corrigido em
`CartaoFoto.tsx`: a altura do palpite agora usa a proporcao REAL de cada foto
(`largura/altura`, ja gravada no banco) em vez de um numero fixo — `Math.round(300 /
proporcao)`, 300px sendo uma largura de coluna tipica (nao precisa ser exata, so precisa
chegar perto o bastante pro salto ficar pequeno demais pra notar). `npm run build` e `lint`
limpos, deploy conferido.

**O que ainda depende do Asafe** — a checklist final do `PLANO.md`, não uma etapa nova (não
existe etapa 7): publicar um evento de verdade com ~500 fotos e conferir a contagem de
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

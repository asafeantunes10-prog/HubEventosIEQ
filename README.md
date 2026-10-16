# Hub de Fotos da Igreja

Site que substitui o link do Google Drive: cada evento da igreja ganha uma página com as
fotos numa grade, para ver e baixar sem conta, sem PIN e sem link que expira.

No ar em **https://eventos-ieq.pages.dev**.

Construído em Cloudflare Pages + Pages Functions + D1 — de propósito, nenhum desses
serviços pede cartão de crédito. As fotos em si não passam por nenhum banco de dados nem
serviço de armazenamento: são arquivos estáticos de um segundo projeto Pages
(`eventos-ieq-fotos`), que o próprio painel atualiza.

## Enviar as fotos de um evento

Tudo pelo painel, sem código. Em **`/admin`**:

1. **Novo evento** → título (o endereço sai dele) → Criar.
2. Na tela do evento, em **Enviar fotos**, arraste as fotos ou a **pasta inteira** (ou use os
   botões "Escolher fotos" / "Escolher uma pasta").
3. Acompanhe a lista: cada arquivo mostra o que aconteceu com ele. No fim as fotos são
   publicadas sozinhas.
4. O evento nasce como **rascunho** — ninguém vê ainda. Confira a galeria, escolha a capa e
   clique em **Publicar** quando estiver pronto.

**Quais arquivos servem:** JPEG, PNG, WebP e **RAW** (Sony ARW, Canon CR3/CR2 e também
NEF, RAF, DNG, ORF, RW2 e outros). O que não é aceito (HEIC de iPhone, vídeo, TIFF) aparece
na tela com o motivo — nada some em silêncio. Arquivos que acompanham a foto, como `.xmp`
do Lightroom, são ignorados de propósito.

**O arquivo original não sobe.** O navegador lê a foto no seu computador, gera as duas
versões leves (miniatura de 400 px e versão grande de 2048 px no lado maior) e manda só
elas — uns 250 MB por evento de 500 fotos, em vez de dezenas de GB de RAW. Por isso é
preciso um **computador** (RAW no celular não tem memória); no celular dá para mandar
JPEG.

**Como o RAW aparece.** O site usa a **prévia que a própria câmera grava dentro do RAW**
— o mesmo que você vê no visor, em tamanho cheio. Duas consequências:

- A foto sai **como a câmera gravou**. Edições feitas no Lightroom/Camera Raw ficam num
  arquivo `.xmp` ou no catálogo, **fora** do RAW, e nenhum navegador as lê. Para mostrar a
  foto editada, exporte em JPEG (como já é feito); o RAW serve para as fotos "puras".
- Se um RAW não tiver prévia grande (alguns DNG de celular, câmeras antigas), o site revela
  o arquivo sozinho e avisa na linha dele que pode ficar mais escuro que na câmera.

**Se der problema no meio:** feche sem medo e envie a mesma pasta de novo — o que já foi
enviado é pulado (aparece como "Já enviada antes"), nada duplica. Fotos com erro têm o
motivo escrito e um botão **Tentar de novo**. Se o envio terminar mas a publicação falhar,
as fotos ficam guardadas e o botão **Publicar agora** tenta de novo.

**Navegador:** Chrome, Edge e Firefox atuais, ou Safari 16.4 ou mais novo. Navegador
antigo demais recebe um aviso em vez de um erro estranho.

Depois de enviado, na mesma tela dá para **reordenar** (setas), escolher a **capa**,
**apagar** uma foto (ela sai do site em alguns segundos) e **arquivar** o evento (ver
abaixo).

## O painel administrativo

Em **`/admin`**, protegido por uma **senha única** (sem conta por pessoa): quem tiver a
senha envia e edita. Para dar acesso a mais alguém, passe a senha; para tirar o acesso de
todo mundo, troque-a.

Para trocar a senha, abra o terminal do VS Code e rode:

```bash
npm run trocar-senha
```

Ele pede a senha nova (escondida enquanto você digita, e depois uma segunda vez para
confirmar), grava na Cloudflare e publica o site para a troca valer. Use **pelo menos 12
caracteres**; uma frase com espaços serve ("minha igreja 2026 avante"). A senha nunca aparece
na tela nem fica em arquivo. Se a pasta tiver mudanças sem commit, ou o GitHub tiver algo que
este computador não tem, o comando grava a senha mas **não publica sozinho** e avisa o que
fazer. Quem trocar a senha desloga todo mundo.

Se preferir uma senha sorteada (20 caracteres, sem letras confusas), `npm run gerar-senha`
mostra uma e imprime os dois comandos que gravam na Cloudflare; aí é só ter cuidado de colar
cada valor no lugar certo.

## Configurar o envio de fotos (uma vez só)

O painel publica as fotos pela API do Cloudflare, e isso precisa de três coisas suas — todas
gratuitas e **sem cartão**:

1. **Criar o projeto das fotos:**
   ```bash
   npx wrangler pages project create eventos-ieq-fotos --production-branch=main
   ```
2. **Criar um token de API.** Em <https://dash.cloudflare.com/profile/api-tokens> →
   *Create Token* → *Create Custom Token*, com a permissão **Account → Cloudflare Pages →
   Edit**. Copie o token (aparece uma vez) e também o **Account ID** (na página inicial da
   conta, coluna da direita). Depois grave os dois como secrets do site:
   ```bash
   npx wrangler pages secret put CF_API_TOKEN --project-name=eventos-ieq
   npx wrangler pages secret put CF_ACCOUNT_ID --project-name=eventos-ieq
   ```
3. **Levar as fotos que já existem** para o projeto novo e passar o site a apontar para lá,
   nesta ordem (assim o site no ar nunca fica sem foto):
   ```bash
   npm run migrar                              # cria as colunas novas no banco de produção
   npm run migrar-fotos -- --baixar-do-site    # leva as fotos para eventos-ieq-fotos e grava os hashes
   npm run implantar                           # publica o site, já apontando para as fotos novas
   ```

   O `--baixar-do-site` traz de `eventos-ieq.pages.dev` as fotos que não estiverem na pasta
   `fotos/` deste computador (por exemplo, as de um evento que foi publicado de outro PC). Isso
   só funciona **antes** do `npm run implantar`, porque é ele que substitui o site antigo.
   Nunca use `--apagar-sem-arquivo` com um evento real: ele apaga as fotos do banco.

Depois disso a pasta `fotos/` fica só como cópia de segurança. (`npm run migrar-fotos` só
roda uma vez: depois que o painel recebe fotos ele se recusa a rodar de novo, para não
apagá-las.)

## Arquivar um evento antigo

O plano gratuito da Cloudflare tem um teto de **20.000 arquivos por projeto**. Cada foto
conta como dois (miniatura + versão grande), então cabem uns 20 eventos de 500 fotos. A
tela de envio mostra quanto já foi usado e avisa quando passa de 90%.

Para liberar espaço, abra o evento antigo e clique em **Arquivar**. Isso tira do ar a versão
grande das fotos dele — liberando a maior parte dos arquivos — e mantém as miniaturas: a
página continua no ar e a grade continua bonita; só o download em alta (foto avulsa e ZIP)
deixa de existir para aquele evento. **Não dá para desfazer pelo painel**; só enviando as
fotos de novo.

## Backup

As fotos no site são **versões leves**, e o painel não guarda os originais: o backup de
verdade são os **RAW e JPEG que a equipe já mantém**. Se um dia o site perder tudo, envie as
pastas de novo — leva alguns minutos por evento. O D1 (títulos, ordem das fotos, capas) vive
só na Cloudflare; se isso importar, guarde uma cópia com
`npx wrangler d1 export hub-eventos-ieq --remote --output backup.sql`.

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build            # checagem de tipos + build de produção
npm run lint             # oxlint
npm test                 # testes unitários (node --test)
npm run tipos:functions  # checagem de tipos das Functions
npm run implantar        # constrói e publica o SITE (as fotos não vão junto)
npm run migrar-fotos     # uso único, ver "Configurar o envio de fotos"
npm run trocar-senha     # troca a senha do painel (pede, grava e publica)
npm run gerar-senha      # sorteia uma senha e imprime os comandos para gravar
npm run migrar:local     # aplica as migrações no banco local
npm run migrar           # aplica as migrações em produção
```

## Numa máquina nova

```bash
npm install
npm approve-scripts esbuild
npm approve-scripts workerd
```

O segundo e o terceiro comando são obrigatórios — sem eles `esbuild` e `workerd` ficam sem
binário instalado, e nem o `vite` nem o `wrangler` funcionam. O erro que aparece nesse caso
não deixa isso claro.

## Estado do projeto

Este README explica **como usar** o site já pronto. O que está construído, o que falta e
as decisões técnicas por trás de cada etapa ficam em [`CLAUDE.md`](CLAUDE.md) — pensado
para retomar o trabalho em outra máquina ou outra sessão, mas que serve igual como
histórico do projeto para qualquer pessoa. O plano original, com todo o raciocínio de
arquitetura, está em [`PLANO.md`](PLANO.md).

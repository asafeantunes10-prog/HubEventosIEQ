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
remoto). Build e lint passam.

**Próxima: etapa 2 — o script de publicação** (`scripts/publicar.mjs`).

O núcleo já existe e está testado: gera `-t.webp` (400px) e `-g.webp` (2048px) com
`sharp`, extrai LQIP de 20px, nunca amplia, grava em `fotos/<slug>/`, conta os arquivos do
site e recusa rodar por cima de um evento já processado. Faltam três coisas, todas
descritas no `PLANO.md`:

1. Inserir os metadados no D1 (hoje ele só escreve um `fotos.json` local).
2. Tornar retomável de verdade — comparar `nome_original` com o que já está no D1, em vez
   da guarda que hoje só recusa a pasta inteira.
3. `vite build` → popular `dist/fotos/` por hardlink (`fs.link`, com queda para cópia) →
   `wrangler pages deploy dist`.

**Bloqueio conhecido:** o projeto Pages ainda não existe. O primeiro
`wrangler pages deploy` cria ele — **pergunte ao Asafe** antes, ele pode preferir criar
pelo painel.

### Duas pendências pequenas, herdadas da etapa 1

- O teste de independência literal (renomear `c:\Projetos\LandingPageAS`) nunca rodou: o
  VS Code mantém a pasta aberta e trava o rename. A prova equivalente passou — `npm ci &&
  npm run build` numa cópia fora de `c:\Projetos`. Se a pasta estiver livre, rode o teste
  do plano e risque este item.
- O grep de verificação acha `R2` em `src/lib/fotos.ts` e `wrangler.toml`. São comentários
  explicando **por que o R2 está proibido**, não vínculos. O Asafe ainda não decidiu se
  saem.

---

## Regras invioláveis

### 1. Nada neste projeto pede cartão de crédito

O Asafe não tem cartão disponível. Isso é restrição dura, não preferência.

**O Cloudflare R2 está fora do projeto** porque exige cartão mesmo no plano grátis. Se a
solução mais óbvia para um problema parecer "põe no R2" — ou qualquer serviço que peça
cartão na ativação — **pare e diga isso a ele**. É o caminho errado.

Pages, Pages Functions, D1 e Access não pedem cartão. É com isso que se trabalha.

### 2. Este projeto é independente de `c:\Projetos\LandingPageAS`

Aquele projeto foi **molde**, aberto uma única vez na etapa 1 para copiar arquivos. O
vínculo está cortado e não volta.

Proibido: `import` que saia da pasta, alias de TS ou Vite apontando para fora, `link:` ou
`file:` no `package.json`, symlink, submódulo, ou qualquer recurso de conta compartilhado.
**Nunca abra aquela pasta.** Se precisar de algo que existe lá, escreva do zero aqui.

### 3. Pare nas ações que dependem do Asafe

Criar conta, `wrangler login`, criar projeto Pages, ligar o Cloudflare Access — tudo que
exige navegador ou decisão dele. Diga exatamente o que fazer e espere. Não contorne.

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
- **`npm run publicar` ainda não é retomável.** Rodar duas vezes gerava UUIDs novos e
  duplicava tudo em silêncio; hoje há uma guarda que recusa a pasta já processada. A
  retomada por `nome_original` é parte da etapa 2.
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

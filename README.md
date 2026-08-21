# Hub de Fotos da Igreja

Site que substitui o link do Google Drive: cada evento da igreja ganha uma página com as
fotos numa grade, para ver e baixar sem conta, sem PIN e sem link que expira.

No ar em **https://eventos-ieq.pages.dev**.

Construído em Cloudflare Pages + Pages Functions + D1 — de propósito, nenhum desses
serviços pede cartão de crédito. As fotos em si não passam por nenhum banco de dados nem
serviço de armazenamento: são arquivos estáticos do próprio site, publicados junto com ele.

## Publicar um evento novo

```bash
npm run publicar "C:\Fotos\Culto de Jovens 2026"
```

O nome da pasta vira o título do evento e o endereço (`/e/culto-de-jovens-2026`). O comando:

1. Gera duas versões WebP de cada foto (miniatura de 400px e versão grande de 2048px).
2. Grava os metadados no banco (D1).
3. Publica o site.

O evento nasce como **rascunho** — não aparece para ninguém ainda. Publicar é decisão sua,
depois de conferir a galeria pelo painel (`/admin`).

**É retomável.** Se o comando cair no meio (queda de luz, rede, um `Ctrl+C`), rode de novo:
ele continua da foto onde parou, sem reprocessar nem duplicar nada.

Duas flags úteis para testar sem afetar o site no ar:

```bash
npm run publicar "<pasta>" -- --local        # grava no banco de teste da máquina, não publica
npm run publicar "<pasta>" -- --sem-deploy   # processa e grava, mas não publica
```

## O painel administrativo

Em **`/admin`**, protegido por uma senha única (sem conta por pessoa). Lá dá para editar
título e descrição, reordenar fotos, escolher a capa, personalizar a cor do evento,
publicar/despublicar e apagar — tudo pelo celular, inclusive.

Só o **envio de fotos** exige o PC (é o `npm run publicar` acima) — o resto do painel
funciona de qualquer lugar.

Para trocar a senha:

```bash
npm run gerar-senha "sua-senha-nova"
```

O comando imprime dois `wrangler pages secret put` para rodar — é isso que grava a senha
nova na Cloudflare. Sem argumento, ele sorteia uma senha forte em vez de pedir uma.

## Arquivar um evento antigo

O plano gratuito da Cloudflare tem um teto de **20.000 arquivos no site**. Cada foto conta
como dois (miniatura + versão grande), então o site aguenta uns 20 eventos de 500 fotos.

Quando `npm run publicar` avisar que o site está passando de 18.000 arquivos, arquive os
eventos com mais de um ano:

```bash
npm run arquivar culto-de-jovens-2024               # so mostra o que apagaria
npm run arquivar culto-de-jovens-2024 -- --confirmar   # apaga de verdade e publica
```

Isso apaga a versão grande (2048px) das fotos daquele evento — libera a maior parte dos
arquivos dele — e mantém as miniaturas: a página continua no ar, a grade continua bonita,
só o download em alta (foto avulsa e ZIP) deixa de existir para aquele evento.

**Sem `--confirmar` o comando só simula** — nada é apagado. É a forma seguro de conferir
antes, já que apagar arquivo aqui não tem volta (ver o aviso sobre backup abaixo).

## A pasta `fotos/` — o backup que não é automático

As fotos processadas moram em `fotos/`, **fora do repositório git** (são gigabytes de
imagem; o GitHub não aguentaria, e cada operação do git ficaria lenta). Ela é o único lugar
com os originais processados — se ela se perder desta máquina, **não há de onde
republicar**.

**Guarde uma cópia de `fotos/` num HD externo ou no Google Drive, sempre.** Isso é
responsabilidade do projeto, não excesso de cuidado.

Cada pasta de evento também carrega um `fotos.json` — um espelho do que está gravado no
banco (título, ordem das fotos, dimensões, LQIP). Ele nunca é publicado, mas serve para
reconstruir o banco inteiro a partir da cópia de backup, caso o D1 algum dia se perca.

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build            # checagem de tipos + build de produção
npm run lint              # oxlint
npm run publicar "<pasta>"    # processa e publica um evento
npm run arquivar "<slug>"     # libera arquivos de um evento antigo
npm run gerar-senha           # gera (ou troca) a senha do painel
npm run migrar:local     # aplica as migrações no banco local
npm run migrar            # aplica as migrações em produção
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

A pasta `fotos/` **não vem no `git clone`** (ver acima) — restaure-a da cópia de backup
antes de publicar qualquer coisa desta máquina.

## Estado do projeto

Este README explica **como usar** o site já pronto. O que está construído, o que falta e
as decisões técnicas por trás de cada etapa ficam em [`CLAUDE.md`](CLAUDE.md) — pensado
para retomar o trabalho em outra máquina ou outra sessão, mas que serve igual como
histórico do projeto para qualquer pessoa. O plano original, com todo o raciocínio de
arquitetura, está em [`PLANO.md`](PLANO.md).

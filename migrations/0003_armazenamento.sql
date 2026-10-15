-- Envio de fotos pelo painel.
--
-- Ate aqui as fotos eram arquivos de uma pasta do PC do Asafe, publicados junto
-- com o site. Agora elas moram num SEGUNDO projeto Pages (so de estaticos) que o
-- proprio painel atualiza pela API do Cloudflare. Para montar o deploy desse
-- projeto o servidor precisa saber, de cada arquivo, o hash que o Pages usa para
-- identificar conteudo — por isso as colunas abaixo.

-- Hash no formato do Pages: blake3(base64(arquivo) + extensao), 32 primeiros
-- caracteres hexa. Nulo = foto anterior a esta migracao, ainda sem hash; o
-- `publicar` do painel RECUSA rodar enquanto existir foto no ar sem hash, porque
-- um deploy sem ela a apagaria do site.
alter table fotos add column hash_t text;
alter table fotos add column hash_g text;

-- Onde a foto esta na fila de publicacao:
--   0 = registrada, ainda fora do ar (o site publico nao a mostra)
--   2 = incluida no deploy que esta rodando agora
--   1 = no ar
-- O padrao 1 e de proposito: tudo que ja existia esta no ar.
-- Separar "registrada" de "no ar" evita a galeria publica mostrar imagem
-- quebrada durante o intervalo entre gravar a linha e o deploy terminar.
alter table fotos add column no_ar integer not null default 1;

-- `nome|tamanho|ultima modificacao` do arquivo de origem. Serve para retomar um
-- envio interrompido sem duplicar, e e mais fiel que o `nome_original` sozinho:
-- dois cartoes de memoria geram os dois um `IMG_0001`, e comparar so o nome
-- jogaria o segundo fora como "ja enviado".
alter table fotos add column chave_origem text;

-- Hora em que a foto foi tirada (EXIF), ISO 8601. Ordena o lote quando ha mais
-- de uma camera no mesmo evento.
alter table fotos add column capturada_em text;

create unique index idx_fotos_chave_origem
  on fotos(evento_id, chave_origem)
  where chave_origem is not null;

-- A consulta que monta o manifesto do deploy so olha o que esta no ar ou em
-- publicacao.
create index idx_fotos_no_ar on fotos(no_ar, evento_id);

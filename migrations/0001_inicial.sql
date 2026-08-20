-- Schema inicial do hub de fotos.
--
-- O banco guarda so METADADOS. As fotos sao arquivos estaticos do proprio site,
-- publicados junto com ele — o D1 nunca ve um byte de imagem.
--
-- Duas tabelas e nada mais. O que personaliza cada evento (capa, cor, layout,
-- se aparece na home, se permite ZIP) vive como coluna em `eventos`, e nao numa
-- tabela de configuracao a parte: sao poucos campos, sempre lidos juntos com o
-- evento, e uma consulta a menos por pagina.

create table eventos (
  id            text primary key,
  slug          text not null unique,               -- tambem e o nome da pasta em fotos/
  titulo        text not null,
  descricao     text,
  data_evento   text,                               -- AAAA-MM-DD
  capa_id       text,                               -- id da foto usada como capa
  status        text not null default 'rascunho',   -- rascunho | publicado
  listado       integer not null default 1,         -- 0 = so quem tem o link
  destaque      integer not null default 0,         -- fixa no topo da home
  permite_zip   integer not null default 1,
  cor_destaque  text,                               -- hex; sobrescreve --primary
  layout        text not null default 'mosaico',    -- mosaico | uniforme
  arquivado     integer not null default 0,         -- 1 = versoes -g removidas
  total_fotos   integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

create table fotos (
  id            text primary key,
  evento_id     text not null references eventos(id) on delete cascade,
  -- 'culto-jovens-2026/a1b2' — SEM sufixo de tamanho e SEM extensao. Quem
  -- completa a URL e `urlFoto()`, o unico lugar do codigo que sabe de onde vem
  -- uma foto. E o que torna barata uma migracao futura.
  caminho       text not null,
  nome_original text,
  largura       integer,
  altura        integer,
  lqip          text,                               -- base64 de 20px, embutido no JSON
  ordem         integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

-- A consulta que roda em toda abertura de galeria: as fotos de um evento, na
-- ordem. Sem este indice o D1 varre a tabela inteira.
create index idx_fotos_evento on fotos(evento_id, ordem);

-- A consulta da home: publicados, destaques primeiro, mais recentes antes.
create index idx_eventos_status on eventos(status, destaque, data_evento desc);

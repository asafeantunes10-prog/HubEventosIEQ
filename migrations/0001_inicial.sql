-- Schema inicial do hub de fotos.
--
-- Duas tabelas e nada mais: eventos e fotos. O que personaliza cada evento
-- (capa, cor, layout, ordem, se aparece na home, se permite ZIP) vive como
-- coluna em `eventos`, e nao numa tabela de configuracao a parte — sao poucos
-- campos, sempre lidos juntos com o evento, e uma consulta a menos por pagina
-- e uma requisicao a menos contra a quota diaria.

create table eventos (
  id            text primary key,
  slug          text not null unique,
  titulo        text not null,
  descricao     text,
  data_evento   text,                                -- AAAA-MM-DD
  capa_id       text,                                -- id da foto usada como capa
  status        text not null default 'rascunho',    -- rascunho | publicado
  listado       integer not null default 1,          -- 0 = so quem tem o link
  destaque      integer not null default 0,          -- fixa no topo da home
  permite_zip   integer not null default 1,
  cor_destaque  text,                                -- hex; sobrescreve --primary
  layout        text not null default 'mosaico',     -- mosaico | uniforme
  ordem_fotos   text not null default 'envio',       -- envio | nome | data
  total_fotos   integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

create table fotos (
  id            text primary key,
  evento_id     text not null references eventos(id) on delete cascade,
  chave         text not null,                       -- prefixo no R2: <evento>/<uuid>
  extensao      text not null default 'webp',
  nome_original text,
  largura       integer,
  altura        integer,
  lqip          text,                                -- base64 de 20px, embutido no JSON
  ordem         integer not null default 0,
  criado_em     text not null default (datetime('now'))
);

-- A consulta que roda em toda abertura de galeria: as fotos de um evento, na
-- ordem, paginadas de 60 em 60. Sem este indice o D1 varre a tabela inteira a
-- cada pagina.
create index idx_fotos_evento on fotos(evento_id, ordem);

-- A consulta da home: publicados, destaques primeiro, mais recentes antes.
create index idx_eventos_status on eventos(status, destaque, data_evento desc);

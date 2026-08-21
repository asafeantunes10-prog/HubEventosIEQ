-- Limitador de tentativas do login do painel.
--
-- So existe por causa da troca do Cloudflare Access (que passou a pedir
-- cartao de credito mesmo no plano gratuito da equipe, mesmo motivo que
-- tirou o R2 do projeto) por uma senha unica com PBKDF2 modesto (ver
-- functions/lib/senha.ts). Sem o Access cuidando disso, barrar tentativas
-- repetidas vira responsabilidade do proprio projeto.
create table tentativas_login (
  chave       text primary key,  -- IP de quem tentou (cf-connecting-ip)
  contagem    integer not null default 1,
  expira_em   integer not null   -- epoch seconds; a janela reseta sozinha
);

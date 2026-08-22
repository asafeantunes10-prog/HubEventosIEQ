-- Contador para o nome amigavel do arquivo de cada foto (IMG_0001, IMG_0002...).
--
-- Precisa ser um contador GRAVADO, e nao "a maior numero que existe hoje em
-- `fotos`" calculado na hora: se a maior foto de um evento for apagada pelo
-- painel (apagar foto avulsa), recalcular do zero devolveria aquele numero
-- para a proxima foto processada — um arquivo novo pisando no nome de um que
-- já pode ter sido cacheado por um navegador ou indexado num link
-- compartilhado. So cresce, nunca reflete quantas fotos existem agora.
alter table eventos add column proximo_numero_foto integer not null default 0;

import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
  Nenhum caminho daqui sai desta pasta. O alias `@` aponta para `./src` deste
  projeto e nada mais: e o que garante que renomear ou apagar qualquer outra
  pasta do disco nao derrube este build.
*/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  server: {
    watch: {
      /*
        `fotos/` guarda as versoes processadas de todos os eventos — milhares
        de WebP, alguns GB. Fica fora do observador por dois motivos:

        1. Observar milhares de arquivos consome descritores a toa; o site nao
           le nenhum deles em desenvolvimento pelo disco, e sim pela URL.
        2. No Windows o arquivo continua travado durante a gravacao: o
           observador do Vite morre com EBUSY ao tentar abrir uma foto que o
           `npm run publicar` ainda esta escrevendo, e leva o servidor junto.
      */
      ignored: ['**/fotos/**'],
    },
  },

  build: {
    // Avisa quando um pedaco passa de 400 KB, antes de virar problema em 4G.
    chunkSizeWarningLimit: 400,
  },
})

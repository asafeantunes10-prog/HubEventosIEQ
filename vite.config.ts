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
        `fotos-entrada/` guarda os JPEG originais que alimentam o
        `npm run publicar` — nunca sao servidos ao navegador.

        Fica fora do observador porque no Windows o arquivo continua travado
        durante a copia: o observador do Vite morre com EBUSY ao tentar abrir
        uma foto ainda sendo copiada, e leva o servidor junto.
      */
      ignored: ['**/fotos-entrada/**'],
    },
  },

  build: {
    // Avisa quando um pedaco passa de 400 KB, antes de virar problema em 4G.
    chunkSizeWarningLimit: 400,
  },
})

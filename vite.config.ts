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
           observador do Vite morre com EBUSY ao tentar abrir uma foto que ainda
           esta sendo escrita, e leva o servidor junto.
      */
      ignored: ['**/fotos/**'],
    },
  },

  /*
    O codificador de WebP (@jsquash/webp) e o leitor de RAW (LibRaw) acham o
    proprio .wasm por `new URL('x.wasm', import.meta.url)`. O pre-empacotamento
    de dependencias do modo dev reescreveria esse caminho e o arquivo deixaria de
    ser encontrado; fora dele o Vite o trata como asset, no dev e no build.
  */
  optimizeDeps: {
    exclude: ['@jsquash/webp', '@colorhythm/libraw-wasm'],
  },

  // Os workers do envio de fotos usam `import()` dinamico (RAW so quando preciso).
  worker: {
    format: 'es',
  },

  build: {
    // Avisa quando um pedaco passa de 400 KB, antes de virar problema em 4G.
    chunkSizeWarningLimit: 400,
  },
})

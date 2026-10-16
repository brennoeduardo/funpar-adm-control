/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

// O build gera um único HTML (sem assets externos) para ser aberto direto da unidade G:
// com duplo clique. Os dados entram por <script src="dados/gerado/dados.js">, que funciona em file://.
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) },
  },
  // public/dados só serve ao desenvolvimento; no build os dados vêm do gerador, ao lado do HTML.
  build: { copyPublicDir: false },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})

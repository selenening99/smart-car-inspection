import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/smart-car-inspection/',
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    https: {},
  },
  build: {
    rollupOptions: {
      input: {
        engineering: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
})

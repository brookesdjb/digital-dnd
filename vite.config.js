import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: false },
  assetsInclude: ['**/*.glsl'],
  resolve: {
    dedupe: ['three'],
    alias: { three: resolve('./node_modules/three') },
  },
})

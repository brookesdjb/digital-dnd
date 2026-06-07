import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glsl'],
  resolve: {
    dedupe: ['three'],
    alias: { three: resolve('./node_modules/three') },
  },
})

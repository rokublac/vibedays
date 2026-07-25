/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

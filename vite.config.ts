import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const editorApiPort = Number.parseInt(runtimeEnv.EDITOR_API_PORT || '4399', 10)
const editorVitePort = Number.parseInt(runtimeEnv.EDITOR_VITE_PORT || '5173', 10)

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: editorVitePort,
    proxy: {
      '/api': `http://127.0.0.1:${editorApiPort}`,
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // ngrok share link: allow the free ngrok domains through Vite's host check.
  preview: { port: 4173, allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'] },
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0])

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ngrok share link: allow the free ngrok domains through Vite's host check (dev and preview).
  server: { port: 5173, allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'] },
  preview: { port: 4173, allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'] },
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0])

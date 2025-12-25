import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      '1387ac13f6bb.ngrok-free.app'
    ]
  }
})

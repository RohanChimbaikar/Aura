import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * API + Socket.IO are proxied to Flask-SocketIO.
 * Start the backend first: from /backend run `python app.py` (port 5000, uses socketio.run).
 * Using 127.0.0.1 avoids some Windows localhost → IPv6 (::1) proxy issues.
 */
const backendOrigin = 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/outputs': {
        target: backendOrigin,
        rewrite: (path) => `/api${path}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendOrigin,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: run the server on :3000 and open https://localhost:5173 is NOT needed — http://localhost is a secure context.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});

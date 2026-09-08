import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
          {
            name: 'local-development-csp',
            transformIndexHtml(html) {
              return html
                .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
                .replace("connect-src 'self';", "connect-src 'self' ws://127.0.0.1:5173;");
            },
          },
        ]
      : []),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: false },
}));

import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { doors, serves } from 'kehikot-module-protocol/serve'
import { defineConfig } from 'vite'

import { BUILD, MANIFEST, TICKET, answer } from './doors.ts'
import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * - `serves()` first: it claims the port from PREFERRED_PORT (or $PORT from a host) and keeps the
 *   registration true. So no `server.port` here.
 * - `doors()` serves everything that is not a source file from this one process: the manifest, the
 *   page at `/app`, and `/healthz` through `answer` in doors.ts. A module is ONE ORIGIN.
 * - `host: '127.0.0.1'` and `cors: false`: nothing off this machine reaches it.
 * - `base: './'`, because a host frames this at whatever address it wrote down.
 */
export default defineConfig({
  base: './',
  plugins: [
    serves({ id: ID, prefer: PREFERRED_PORT }),
    doors({ manifest: MANIFEST, answer, build: BUILD, page: { title: 'Inbox', ticket: TICKET } }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', cors: false },
  build: { outDir: 'dist', emptyOutDir: true },
})

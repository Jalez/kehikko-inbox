import { establishBuild, mintTicket, type Reply } from 'kehikot-module-protocol/serve'

import { ID, MANIFEST, VERSION } from './manifest.ts'

/**
 * Every door but the page, as one pure function: `answer` takes a request and returns a status and
 * a body, or `null` for "not ours, let Vite have it". The Inbox keeps nothing and has no tools for
 * agents — the record is the host's, and only the person acts on it — so the one door is the
 * health check.
 */

/** Printed into `/app` by `doors()`. Nothing here takes a write; it is minted because the page carries one. */
export const TICKET = mintTicket()

/** What this process is built from, and when it started: said in the manifest, at `/healthz` and in the page. */
export const BUILD = establishBuild({ version: VERSION, dir: import.meta.dirname })

export function answer(
  method: string,
  path: string,
  _query: URLSearchParams,
  _body: Record<string, unknown> | null,
  _ticket: string | null,
): Reply | null {
  if (path === '/healthz') return { status: 200, body: { ok: true, id: ID, version: VERSION, keeps: 'nothing: the Inbox is the host’s record' } }
  if (path === '/mcp') return { status: 404, body: { ok: false, error: 'Inbox has no tools for agents: only the person acts on their Inbox.' } }
  /* An unknown path under /api/ is ours to refuse, not Vite's to serve as a file. */
  if (path.startsWith('/api/')) return { status: 404, body: { ok: false, error: `not here (${method} ${path.slice(0, 80)})` } }
  return null
}

export { MANIFEST }

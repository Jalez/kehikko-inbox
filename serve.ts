#!/usr/bin/env bun
import { run } from 'kehikot-module-protocol/run'

import { answer, BUILD, MANIFEST, TICKET } from './doors.ts'
import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * This module over its BUILT page (`bun run build`), on the same doors and the same port. `run.sh`
 * starts this when `dist/` carries a stamp of the commit checked out, and Vite otherwise.
 */
await run({
  id: ID,
  prefer: PREFERRED_PORT,
  dir: import.meta.dirname,
  manifest: MANIFEST,
  answer,
  build: BUILD,
  ticket: TICKET,
})

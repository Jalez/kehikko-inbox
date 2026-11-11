import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { rowsAdvice } from 'kehikot-module-protocol'

import { answer } from '../doors.ts'
import { ID, MANIFEST, PREFERRED_PORT } from '../manifest.ts'
import { footerItems } from '../src/footer.ts'
import { headerItems, pressHeader } from '../src/header.ts'
import { DEFAULT_FILTER } from '../src/inbox.ts'

describe('the manifest', () => {
  test('the Inbox, under a new id, asking only what it calls', () => {
    expect(ID).toBe('kehikot.inbox')
    expect(MANIFEST.name).toBe('Inbox')
    expect(MANIFEST.icon).toBe('lucide:inbox')
    expect(MANIFEST.declares.uses).toEqual(['inbox:person', 'state:keep'])
    expect(MANIFEST.partless).toBeTruthy()
    expect(MANIFEST.extensions.consumes).toEqual([])
    expect(PREFERRED_PORT).toBe(7910)
  })

  test('its version is package.json’s', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { version: string; name: string }
    expect(MANIFEST.version).toBe(pkg.version)
    expect(pkg.name).toBe('kehikko-inbox')
  })

  test('every release has its notes, and the notes say what kind of release it is', () => {
    const notes = readFileSync(join(import.meta.dir, '..', 'notes', `${MANIFEST.version}.md`), 'utf8')
    expect(notes.split('\n')[0]).toMatch(/^Kind: (breaking|feature|fix)$/)
  })
})

describe('the doors', () => {
  test('a health check, no tools and nothing kept', () => {
    const health = answer('GET', '/healthz', new URLSearchParams(), null, null)
    expect(health?.status).toBe(200)
    expect((health?.body as { id: string }).id).toBe(ID)
    expect(answer('POST', '/mcp', new URLSearchParams(), {}, null)?.status).toBe(404)
    expect(answer('GET', '/api/anything', new URLSearchParams(), null, null)?.status).toBe(404)
    expect(answer('GET', '/src/app.tsx', new URLSearchParams(), null, null)).toBeNull()
  })
})

describe('the header’s presses', () => {
  test('each switch takes its own options, and refuses anything else in words', () => {
    expect(pressHeader(DEFAULT_FILTER, 'show', 'needs')).toEqual({ show: 'needs', where: 'everywhere' })
    expect(pressHeader(DEFAULT_FILTER, 'where', 'here')).toEqual({ show: 'all', where: 'here' })
    expect(pressHeader(DEFAULT_FILTER, 'show', 'bogus')).toBe('Show is Everything or Needs you only.')
    expect(pressHeader(DEFAULT_FILTER, 'nope', true)).toBe('Inbox has nothing called "nope" to press.')
  })

  test('the default is everything, everywhere', () => {
    const items = headerItems(DEFAULT_FILTER) as { id: string; value: string }[]
    expect(items.map((one) => one.value)).toEqual(['all', 'everywhere'])
  })
})

describe('the rows', () => {
  test('kehikot.rows.json says what the code declares, and the rule has nothing to say about it', () => {
    const rows = JSON.parse(readFileSync(join(import.meta.dir, '..', 'kehikot.rows.json'), 'utf8')) as { header: unknown[]; footer: unknown[] }[]
    expect(rows[0]!.header).toEqual(headerItems(DEFAULT_FILTER))
    expect(rows[2]!.footer).toEqual(footerItems({ tally: { needs: 2, working: 1, finished: 0, elsewhere: 1 }, next: true, trouble: null }))
    for (const row of rows) expect(rowsAdvice(row.header, row.footer, { state: true })).toEqual([])
  })
})

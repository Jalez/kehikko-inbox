import { afterEach, describe, expect, mock, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'

import { HostRefused } from 'kehikot-module-protocol/client'
import type { FooterItemInput, HeaderItemInput, InboxReadResult } from 'kehikot-module-protocol'

import { Screen, type Presses, type Signal } from '../src/app.tsx'
import { DEFAULT_FILTER, NOTHING_NEEDS_YOU, OLD_HOST, type Filter } from '../src/inbox.ts'
import { inboxApi, type InboxApi } from '../src/wire/inbox-api.ts'
import type { Host } from '../src/wire/use-kehikot.ts'
import { item, readOf } from './fixtures.ts'

afterEach(cleanup)

/** A host that frames the page, records what it is told, and answers the Inbox's methods from `answers`. */
function fakeHost(answers: Record<string, (params: Record<string, unknown>) => unknown>, over: Partial<Host> = {}) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const headers: HeaderItemInput[][] = []
  const footers: FooterItemInput[][] = []
  const ready = mock(() => {})
  const host: Host = {
    where: 'hosted',
    projectPath: '/work/kehikot',
    answers: null,
    drawsFooter: true,
    visible: true,
    request: async (method, params = {}) => {
      asked.push({ method, params })
      const answer = answers[method]
      if (!answer) throw new HostRefused({ reason: 'unknown-method', error: `no ${method}` })
      return answer(params)
    },
    header: (items) => void headers.push(items),
    footer: (items) => void footers.push(items),
    ready,
    ...over,
  }
  return { host, asked, headers, footers, ready, api: inboxApi(host.request) }
}

const done = () => ({ outcome: 'done', changed: 1, why: '' })

function show(read: InboxReadResult, extra: Record<string, (params: Record<string, unknown>) => unknown> = {}, props: { filter?: Filter; signal?: Signal | null; box?: { height: number }; presses?: Presses; host?: Partial<Host>; onFilter?: (filter: Filter) => void } = {}) {
  const fake = fakeHost(
    {
      'inbox.read': () => read,
      'inbox.act': done,
      'inbox.open': () => ({ outcome: 'opened', why: '' }),
      'inbox.answer': () => ({ outcome: 'sent', why: '' }),
      'inbox.use': done,
      'inbox.log': () => ({ rows: [], more: false, total: 0 }),
      ...extra,
    },
    props.host,
  )
  const view = (signal: Signal | null = props.signal ?? null, api: InboxApi = fake.api) => (
    <Screen host={fake.host} api={api} filter={props.filter ?? DEFAULT_FILTER} onFilter={props.onFilter} signal={signal} box={props.box ?? { height: 600 }} presses={props.presses} now={() => 120_000} />
  )
  const rendered = render(view())
  return { ...fake, rendered, rerender: (signal: Signal | null) => rendered.rerender(view(signal)) }
}

const acts = (asked: { method: string; params: Record<string, unknown> }[]) => asked.filter((one) => one.method !== 'inbox.read' && one.method !== 'inbox.log')

describe('the list', () => {
  test('reads on the greeting, says WHO before what, and says it is drawn', async () => {
    const { ready, asked } = show(readOf({ items: [item({ id: 'q', by: 'Claude', label: 'Which branch?', priority: 'urgent' }), item({ id: 'w', by: 'Queue', state: 'working', label: 'bun test' })] }))
    const needs = await screen.findByRole('region', { name: 'needs you' })
    expect(within(needs).getByText('Claude')).toBeTruthy()
    expect(needs.textContent).toContain('needs you')
    expect(needs.textContent).toContain('urgent')
    expect(needs.textContent).toContain('Which branch?')
    expect(needs.textContent).toContain('part 1 · Wide · Auth')
    expect(needs.textContent).toContain('1 min ago')
    expect(screen.getByRole('region', { name: 'working' }).querySelector('[data-byline]')?.textContent).toBe('Queue · , working')
    expect(asked[0]?.method).toBe('inbox.read')
    await waitFor(() => expect(ready).toHaveBeenCalled())
  })

  test('a state is said in words beside its dot, never by colour alone', async () => {
    show(readOf({ items: [item({ id: 'a' })] }))
    const dot = await screen.findByRole('img', { name: 'needs you' })
    expect(dot.getAttribute('data-dot')).toBe('attention')
  })

  test('a module’s strings are text, never markup', async () => {
    show(readOf({ items: [item({ id: 'x', label: '<b>bold</b> <a href="https://evil.example">link</a>' })] }))
    await screen.findByText('<b>bold</b> <a href="https://evil.example">link</a>')
    expect(document.querySelector('a')).toBeNull()
    expect(document.querySelector('b')).toBeNull()
  })

  test('other projects get a section each; This kehikko groups what is about the whole project', async () => {
    show(
      readOf({ items: [item({ id: 'p', project: true, label: 'Which epic?' }), item({ id: 'h', label: 'here' })], elsewhere: [{ project: { id: 7, name: 'Other' }, items: [item({ id: 'o', label: 'over there' })] }] }),
      {},
      { filter: { show: 'all', where: 'here' } },
    )
    const project = await screen.findByRole('region', { name: 'this project' })
    expect(project.textContent).toContain('Which epic?')
    expect(screen.getByRole('region', { name: 'in Other' }).textContent).toContain('Other · part 1 · Wide · Auth')
  })
})

describe('acts are the person’s presses, with the right params', () => {
  test('pressing a row goes there; another project’s says which project', async () => {
    const { asked } = show(readOf({ items: [item({ id: 'a', label: 'here one' })], elsewhere: [{ project: { id: 7, name: 'Other' }, items: [item({ id: 'o', label: 'there one' })] }] }))
    fireEvent.click(await screen.findByText('here one'))
    fireEvent.click(screen.getByText('there one'))
    await waitFor(() => expect(acts(asked)).toHaveLength(2))
    expect(acts(asked)).toEqual([
      { method: 'inbox.open', params: { module: 'kehikot.claude', id: 'a' } },
      { method: 'inbox.open', params: { module: 'kehikot.claude', id: 'o', project: 7 } },
    ])
  })

  test('dismiss, and no dismiss on a working row', async () => {
    const { asked } = show(readOf({ items: [item({ id: 'a', label: 'ask' }), item({ id: 'w', state: 'working', label: 'busy' })] }))
    fireEvent.click(await screen.findByRole('button', { name: 'dismiss ask' }))
    expect(screen.queryByRole('button', { name: 'dismiss busy' })).toBeNull()
    await waitFor(() => expect(acts(asked)).toEqual([{ method: 'inbox.act', params: { do: 'dismiss', keys: [{ module: 'kehikot.claude', id: 'a' }] } }]))
  })

  test('a question: whole, its choices and a reply; answered says so', async () => {
    const { asked } = show(
      readOf({
        items: [
          item({ id: 'q', question: { text: 'Merge it?\nIt is green.', choices: ['Yes', 'No'], answered: null } }),
          item({ id: 'done-q', module: 'kehikot.codex', question: { text: 'Old?', choices: [], answered: 'Yes' } }),
        ],
      }),
    )
    expect((await screen.findByText(/Merge it\?/)).textContent).toBe('Merge it?\nIt is green.')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(acts(asked)).toEqual([{ method: 'inbox.answer', params: { module: 'kehikot.claude', id: 'q', choice: 'Yes' } }]))
    const reply = screen.getAllByLabelText('Your answer')[0]!
    fireEvent.change(reply, { target: { value: 'Rebase first' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0]!)
    await waitFor(() => expect(acts(asked)[1]).toEqual({ method: 'inbox.answer', params: { module: 'kehikot.claude', id: 'q', answer: 'Rebase first' } }))
    expect(screen.getByText('Answered: Yes')).toBeTruthy()
  })

  test('a declined act says the host’s sentence', async () => {
    show(readOf({ items: [item({ id: 'a', label: 'ask' })] }), { 'inbox.act': () => ({ outcome: 'declined', changed: 0, why: 'Only your own press can do that.' }) })
    fireEvent.click(await screen.findByRole('button', { name: 'dismiss ask' }))
    expect((await screen.findByRole('status')).textContent).toBe('Only your own press can do that.')
  })

  test('an unsent answer says why', async () => {
    show(readOf({ items: [item({ id: 'q', question: { text: 'Go?', choices: ['Go'], answered: null } })] }), { 'inbox.answer': () => ({ outcome: 'declined', why: 'The session is gone.' }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Go' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Not sent: The session is gone.')
  })

  test('stop showing a module, and show it again', async () => {
    const { asked } = show(readOf({ items: [item({ id: 'a', by: 'Claude', mutable: true }), item({ id: 'h', module: 'kehikko', by: 'Kehikot' })], muted: [{ id: 'kehikot.codex', name: 'Codex' }] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop showing Claude here' }))
    expect(screen.queryByRole('button', { name: 'Stop showing Kehikot here' })).toBeNull()
    fireEvent.click(screen.getByText('1 module muted'))
    fireEvent.click(await screen.findByRole('button', { name: 'show Codex in the Inbox again' }))
    await waitFor(() =>
      expect(acts(asked)).toEqual([
        { method: 'inbox.use', params: { module: 'kehikot.claude', use: false } },
        { method: 'inbox.use', params: { module: 'kehikot.codex', use: true } },
      ]),
    )
  })

  test('mark finished as seen, in the kehikko the filter shows', async () => {
    const { asked } = show(readOf({ items: [item({ id: 'd', state: 'done' })] }), {}, { filter: { show: 'all', where: 'here' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Mark finished as seen' }))
    await waitFor(() => expect(acts(asked)).toEqual([{ method: 'inbox.act', params: { do: 'seen-all', scope: 'here' } }]))
  })

  test('Earlier: collapsed, read when opened, a row forgotten, and what is shown forgotten', async () => {
    const { asked } = show(readOf({ earlier: 2 }), {
      'inbox.log': () => ({ rows: [{ key: 'k1', module: 'kehikot.claude', id: 'old', by: 'Claude', label: 'old thing', what: 'finished', where: 'Wide', at: 1_000 }], more: false, total: 1 }),
    })
    const trigger = await screen.findByRole('button', { name: /Earlier/ })
    expect(asked.some((one) => one.method === 'inbox.log')).toBe(false)
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('button', { name: 'forget old thing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forget what is shown' }))
    expect(asked.find((one) => one.method === 'inbox.log')?.params).toEqual({ scope: 'everywhere', offset: 0, limit: 20 })
    await waitFor(() =>
      expect(acts(asked)).toEqual([
        { method: 'inbox.act', params: { do: 'forget', keys: [{ module: 'kehikot.claude', id: 'old' }], scope: 'everywhere' } },
        { method: 'inbox.act', params: { do: 'forget', scope: 'everywhere' } },
      ]),
    )
  })
})

describe('Next', () => {
  test('the host’s next: go to it at once, and highlight its row', async () => {
    const read = readOf({ items: [item({ id: 'a', label: 'first' }), item({ id: 'b', label: 'second' })], next: { module: 'kehikot.claude', id: 'b' } })
    const shown = show(read)
    await screen.findByText('second')
    act(() => shown.rerender({ kind: 'next', next: { module: 'kehikot.claude', id: 'b' }, n: 1 }))
    await waitFor(() => expect(acts(shown.asked)).toEqual([{ method: 'inbox.open', params: { module: 'kehikot.claude', id: 'b' } }]))
    expect(document.querySelector('[data-highlighted]')?.textContent).toContain('second')
  })

  test('next: null says nothing needs you, and opens nothing', async () => {
    const shown = show(readOf({ items: [item({ id: 'w', state: 'working' })] }))
    await screen.findByRole('region', { name: 'working' })
    act(() => shown.rerender({ kind: 'next', next: null, n: 1 }))
    expect((await screen.findByRole('status')).textContent).toBe(NOTHING_NEEDS_YOU)
    expect(acts(shown.asked)).toEqual([])
  })

  test('changed: read again', async () => {
    const shown = show(readOf())
    await waitFor(() => expect(shown.asked.filter((one) => one.method === 'inbox.read')).toHaveLength(1))
    act(() => shown.rerender({ kind: 'changed', next: null, n: 1 }))
    await waitFor(() => expect(shown.asked.filter((one) => one.method === 'inbox.read')).toHaveLength(2))
  })

  test('the footer: the count and Next beside it; Next pressed there goes to the next thing', async () => {
    const presses: Presses = createRef() as Presses
    const shown = show(readOf({ items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'w', state: 'working' })], next: { module: 'kehikot.claude', id: 'a' } }), {}, { presses })
    await screen.findByRole('region', { name: 'needs you' })
    await waitFor(() => expect(JSON.stringify(shown.footers.at(-1))).toContain('2 need you · 1 working'))
    const next = shown.footers.at(-1)!.find((one) => one.id === 'next') as { disabled: string | null; actsOn: string }
    expect(next.disabled).toBeNull()
    expect(next.actsOn).toBe('count')
    act(() => presses.current?.next())
    await waitFor(() => expect(acts(shown.asked)).toEqual([{ method: 'inbox.open', params: { module: 'kehikot.claude', id: 'a' } }]))
  })

  test('a host that draws no footer: the page draws the count and Next itself', async () => {
    const shown = show(readOf({ items: [item({ id: 'a' })], next: { module: 'kehikot.claude', id: 'a' } }), {}, { host: { drawsFooter: false } })
    const foot = await waitFor(() => {
      const found = document.querySelector('[data-own-footer]')
      if (!found) throw new Error('no footer yet')
      return found as HTMLElement
    })
    expect(foot.textContent).toContain('1 needs you')
    fireEvent.click(within(foot).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(acts(shown.asked)).toEqual([{ method: 'inbox.open', params: { module: 'kehikot.claude', id: 'a' } }]))
    expect(shown.footers).toEqual([])
  })
})

describe('a small container', () => {
  test('one line: the count and the top item, which goes there when pressed', async () => {
    const { asked } = show(readOf({ items: [item({ id: 'a', label: 'pick a branch', by: 'Claude' }), item({ id: 'w', state: 'working', label: 'tests' })] }), {}, { box: { height: 56 } })
    const line = await waitFor(() => {
      const found = document.querySelector('[data-small-line]')
      if (!found) throw new Error('not yet')
      return found as HTMLElement
    })
    expect(line.textContent).toContain('1 needs you · 1 working')
    expect(line.textContent).toContain('Claude · needs you')
    expect(line.textContent).toContain('pick a branch')
    expect(screen.queryByRole('region', { name: 'working' })).toBeNull()
    fireEvent.click(within(line).getByRole('button'))
    await waitFor(() => expect(acts(asked)).toEqual([{ method: 'inbox.open', params: { module: 'kehikot.claude', id: 'a' } }]))
  })
})

describe('a host older than the Inbox', () => {
  test('its greeting does not list the Inbox: one sentence, nothing read, no header items', async () => {
    const shown = show(readOf({ items: [item({ id: 'a' })] }), {}, { host: { answers: ['state.set', 'view.goto'] } })
    expect((await screen.findByText(OLD_HOST)).textContent).toBe(OLD_HOST)
    expect(shown.asked).toEqual([])
    expect(shown.headers.at(-1)).toEqual([])
    expect(JSON.stringify(shown.footers.at(-1))).toContain('Inbox is in Kehikot’s bar')
    await waitFor(() => expect(shown.ready).toHaveBeenCalled())
  })

  test('it refuses inbox.read as too old: the same sentence', async () => {
    show(readOf(), {
      'inbox.read': () => {
        throw new HostRefused({ reason: 'unknown-method', error: 'unknown method inbox.read', declined: 'host-too-old', since: '2.79.0' })
      },
    })
    expect(await screen.findByText(OLD_HOST)).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('the header', () => {
  test('declares the two switches, on the filter it is given', async () => {
    const shown = show(readOf(), {}, { filter: { show: 'needs', where: 'here' } })
    await waitFor(() => expect(shown.headers.length).toBeGreaterThan(0))
    const items = shown.headers.at(-1) as { id: string; value: string }[]
    expect(items.map((one) => [one.id, one.value])).toEqual([
      ['show', 'needs'],
      ['where', 'here'],
    ])
  })
})

describe('an empty Inbox', () => {
  const empty = () => document.querySelector('[data-slot="empty"]') as HTMLElement | null
  const seen = async () => {
    await waitFor(() => {
      if (!empty()) throw new Error('not yet')
    })
    return empty() as HTMLElement
  }

  test('with everything shown: the icon, a title and a line, and no button', async () => {
    show(readOf())
    const shown = await seen()
    expect(shown.querySelector('[data-slot="empty-icon"] svg')).not.toBeNull()
    expect(shown.querySelector('[data-slot="empty-title"]')?.textContent).toBe('Nothing needs you')
    expect(shown.querySelector('[data-slot="empty-description"]')?.textContent).toBe('Nothing here right now.')
    expect(within(shown).queryByRole('button')).toBeNull()
  })

  test('because of the filter: says so, and a button shows everything', async () => {
    const onFilter = mock((_: Filter) => {})
    show(readOf({ items: [item({ id: 'w', state: 'working' })] }), {}, { filter: { show: 'needs', where: 'everywhere' }, onFilter })
    const shown = await seen()
    expect(shown.querySelector('[data-slot="empty-description"]')?.textContent).toContain('Only what needs you is shown')
    fireEvent.click(within(shown).getByRole('button', { name: 'Show everything' }))
    expect(onFilter).toHaveBeenCalledWith({ show: 'all', where: 'everywhere' })
  })

  test('because of the scope: names Where, and offers Everywhere', async () => {
    const onFilter = mock((_: Filter) => {})
    show(readOf({ items: [item({ id: 'o', here: false })] }), {}, { filter: { show: 'all', where: 'here' }, onFilter })
    const shown = await seen()
    expect(shown.querySelector('[data-slot="empty-description"]')?.textContent).toContain('Switch Where to Everywhere')
    expect(within(shown).queryByRole('button', { name: 'Show everything' })).toBeNull()
    fireEvent.click(within(shown).getByRole('button', { name: 'Show everywhere' }))
    expect(onFilter).toHaveBeenCalledWith({ show: 'all', where: 'everywhere' })
  })

  test('a small container: just "Nothing needs you" in the line', async () => {
    show(readOf(), {}, { box: { height: 56 } })
    const line = await waitFor(() => {
      const found = document.querySelector('[data-small-line]')
      if (!found) throw new Error('not yet')
      return found as HTMLElement
    })
    expect(line.textContent).toBe('Nothing needs you')
    expect(empty()).toBeNull()
  })
})

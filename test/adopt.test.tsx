import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { HostRefused } from 'kehikot-module-protocol/client'
import type { InboxAdoptionResult, InboxReadResult } from 'kehikot-module-protocol'

import { Screen } from '../src/app.tsx'
import { DEFAULT_FILTER, adoptOffer } from '../src/inbox.ts'
import { inboxApi } from '../src/wire/inbox-api.ts'
import type { Host } from '../src/wire/use-kehikot.ts'
import { item, readOf } from './fixtures.ts'

/**
 * Adopting an item about a change no epic names (protocol 2.88.0): what the row offers, and that each
 * press is one ask of the host, made from the click and never from an effect.
 */

afterEach(cleanup)

const epics = [
  { epic: 'auth', title: 'Auth', parts: [{ id: 'login', name: 'Login' }], refs: [] },
  { epic: 'misc', title: 'Misc', parts: [], refs: [] },
]
const adoption = (over: Partial<InboxAdoptionResult> = {}): InboxAdoptionResult => ({
  outcome: 'ok',
  why: '',
  item: { ref: '!4721', title: 'Fix login', url: 'https://g/x', repo: 'g/app', host: 'g' },
  epics,
  suggested: null,
  conversations: [],
  agent: null,
  proposal: null,
  ...over,
})

describe('what an adoptable item offers', () => {
  const sure = { epic: 'auth', parts: [], why: 'w', sure: true }
  const claude = { module: 'm', name: 'Claude' }
  test('an unambiguous suggestion is one press, with the agent beside it and the picker after', () => {
    expect(adoptOffer(adoption({ suggested: sure }))).toEqual({ primary: { kind: 'add', label: 'Add to Auth', epic: 'auth', parts: [] }, secondary: { kind: 'pick', label: 'Another space…' } })
    expect(adoptOffer(adoption({ suggested: sure, agent: claude }))).toEqual({
      primary: { kind: 'add', label: 'Add to Auth', epic: 'auth', parts: [] },
      secondary: { kind: 'with', label: 'Adopt with Claude…' },
      third: { kind: 'pick', label: 'Choose a space myself…' },
      hint: null,
    })
  })
  test('the kehikko’s agent is the main press; the picker is the other way', () => {
    expect(adoptOffer(adoption({ suggested: { ...sure, sure: false }, agent: claude }))).toEqual({
      primary: { kind: 'with', label: 'Adopt with Claude…' },
      secondary: { kind: 'pick', label: 'Choose a space myself…' },
      hint: null,
    })
  })
  test('never only the picker: choose an agent, update one, or add one', () => {
    const two = adoptOffer(adoption({ taskAgents: [{ module: 'a', name: 'A' }, { module: 'b', name: 'B' }] }))
    expect(two.primary).toEqual({ kind: 'with', label: 'Adopt with an agent…' })
    const old = adoptOffer(adoption({ taskAgents: [], agentsToUpdate: [{ module: 'kehikot.claude', name: 'Claude' }] }))
    expect(old.primary).toEqual({ kind: 'with', label: 'Update Claude…' })
    expect(old.hint).toBe('Update Claude to let it find the right space.')
    const none = adoptOffer(adoption({ taskAgents: [] }))
    expect(none.primary).toEqual({ kind: 'with', label: 'Add an agent module…' })
    expect(none.secondary).toEqual({ kind: 'pick', label: 'Choose a space myself…' })
    expect(none.hint).toBe('Add an agent module to let it find the right space.')
  })
  test('before the host said, or from a host that says nothing of agents: the picker', () => {
    expect(adoptOffer(adoption())).toEqual({ primary: { kind: 'pick', label: 'Choose a space…' }, secondary: null })
    expect(adoptOffer(null).primary.kind).toBe('pick')
  })
})

function show(read: InboxReadResult, answers: Record<string, (params: Record<string, unknown>) => unknown>) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const host: Host = {
    where: 'hosted',
    projectPath: '/work/kehikot',
    answers: null,
    drawsFooter: true,
    visible: true,
    request: async (method, params = {}) => {
      asked.push({ method, params })
      const answer = answers[method] ?? ({ 'inbox.read': () => read, 'inbox.log': () => ({ rows: [], more: false, total: 0 }) } as Record<string, (p: Record<string, unknown>) => unknown>)[method]
      if (!answer) throw new HostRefused({ reason: 'unknown-method', error: `no ${method}` })
      return answer(params)
    },
    header: () => {},
    footer: () => {},
    ready: mock(() => {}),
  }
  render(<Screen host={host} api={inboxApi(host.request)} filter={DEFAULT_FILTER} signal={null} box={{ height: 600 }} now={() => 120_000} />)
  return asked
}

const notice = item({ id: 'gitlab:g/app!4721', module: 'kehikko.trackers', by: 'Tracker', label: '!4721 · changes requested by mona', where: 'Not in any epic · g', adoptable: true })
const key = { module: 'kehikko.trackers', id: 'gitlab:g/app!4721' }

describe('the row', () => {
  test('"Add to Auth" in one press when the suggestion is sure; nothing is adopted without it', async () => {
    const asked = show(readOf({ items: [notice] }), {
      'inbox.adoption': () => adoption({ suggested: { epic: 'auth', parts: [], why: 'w', sure: true } }),
      'inbox.adopt': () => ({ outcome: 'adopted', said: 'Added to Auth', brought: [], why: '' }),
    })
    const add = await screen.findByRole('button', { name: 'Add to Auth' })
    expect(asked.filter((one) => one.method === 'inbox.adopt')).toEqual([])
    fireEvent.click(add)
    await waitFor(() => expect(asked.find((one) => one.method === 'inbox.adopt')?.params).toEqual({ ...key, epic: 'auth', parts: [] }))
  })

  test('the picker: an epic and its parts, then Add', async () => {
    const asked = show(readOf({ items: [notice] }), {
      'inbox.adoption': () => adoption(),
      'inbox.adopt': () => ({ outcome: 'adopted', said: 'Added to Auth', brought: [], why: '' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a space…' }))
    fireEvent.click(await screen.findByLabelText('Login'))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Auth' }))
    await waitFor(() => expect(asked.find((one) => one.method === 'inbox.adopt')?.params).toEqual({ ...key, epic: 'auth', parts: ['login'] }))
  })

  test('"Adopt with <agent>…" asks the host to open its dialog', async () => {
    const asked = show(readOf({ items: [notice] }), {
      'inbox.adoption': () => adoption({ agent: { module: 'kehikot.claude', name: 'Claude' } }),
      'inbox.adoptWith': () => ({ outcome: 'opened', why: '' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Adopt with Claude…' }))
    await waitFor(() => expect(asked.find((one) => one.method === 'inbox.adoptWith')?.params).toEqual(key))
  })

  test('an offer is read again: an agent set up after the first read becomes the main press (the bug)', async () => {
    let agent: { module: string; name: string } | null = null
    const asked = show(readOf({ items: [notice] }), {
      'inbox.adoption': () => adoption({ agent, ...(agent ? {} : { taskAgents: [] }) }),
      'inbox.adoptWith': () => ({ outcome: 'opened', why: '' }),
    })
    /* No agent yet: the fix is offered, and the picker beside it. */
    fireEvent.click(await screen.findByRole('button', { name: 'Add an agent module…' }))
    await waitFor(() => expect(asked.filter((one) => one.method === 'inbox.adoptWith')).toHaveLength(1))
    /* The person added one: the offer read again after the press shows it, no reload. */
    agent = { module: 'kehikot.claude', name: 'Claude' }
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a space myself…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Adopt with Claude…' }))
    await waitFor(() => expect(asked.filter((one) => one.method === 'inbox.adoptWith')).toHaveLength(2))
  })

  test('"Update <agent>…" asks the host, which takes the person to the update', async () => {
    const asked = show(readOf({ items: [notice] }), {
      'inbox.adoption': () => adoption({ taskAgents: [], agentsToUpdate: [{ module: 'kehikot.claude', name: 'Claude' }] }),
      'inbox.adoptWith': () => ({ outcome: 'opened', why: '' }),
    })
    expect(await screen.findByText('Update Claude to let it find the right space.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Update Claude…' }))
    await waitFor(() => expect(asked.find((one) => one.method === 'inbox.adoptWith')?.params).toEqual(key))
  })

  test('"Don\'t track this", then Undo; and an adopted item says what happened, with Undo', async () => {
    const adopted = item({ id: 'x', module: 'kehikko.trackers', by: 'Tracker', after: { said: 'Added to Auth · its Claude Code conversation came along', undo: true } })
    const asked = show(readOf({ items: [notice, adopted] }), {
      'inbox.adoption': () => adoption(),
      'inbox.untrack': () => ({ outcome: 'done', changed: 1, why: '' }),
      'inbox.undo': () => ({ outcome: 'done', changed: 1, why: '' }),
    })
    expect(await screen.findByText('Added to Auth · its Claude Code conversation came along')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Don't track this" }))
    await waitFor(() => expect(asked.find((one) => one.method === 'inbox.untrack')?.params).toEqual(key))
    const undo = await screen.findByText(/Not tracked:/)
    fireEvent.click(undo.parentElement!.querySelector('[data-undo-untrack]')!)
    await waitFor(() => expect(asked.filter((one) => one.method === 'inbox.undo').map((one) => one.params)).toEqual([key]))
    fireEvent.click(document.querySelector('[data-undo]')!)
    await waitFor(() => expect(asked.filter((one) => one.method === 'inbox.undo').map((one) => one.params)).toEqual([key, { module: 'kehikko.trackers', id: 'x' }]))
  })
})

import { describe, expect, test } from 'bun:test'

import { inboxApi, readInbox, readLog } from '../src/wire/inbox-api.ts'
import { item, readOf } from './fixtures.ts'

/**
 * A host's answer is read item by item: one item over a protocol limit (an older host's place ask
 * with seven choices, a label over its length) costs that item, said in one line, and never the
 * whole Inbox. Only an answer whose envelope does not read is an error, and it names the field.
 */

const lines = () => {
  const said: string[] = []
  return { said, skip: (line: string) => void said.push(line) }
}

describe('reading inbox.read', () => {
  test('keeps the items that read and skips one with seven choices, naming the field', () => {
    const { said, skip } = lines()
    const bad = { ...item({ id: 'ask' }), question: { text: 'Which epic?', choices: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], answered: null } }
    const data = readInbox({ ...readOf(), items: [item({ id: 'one' }), bad, item({ id: 'two' })] }, skip)
    expect(data.items.map((one) => one.id)).toEqual(['one', 'two'])
    expect(said.length).toBe(1)
    expect(said[0]).toContain('question.choices')
    expect(said[0]).toContain('ask')
  })

  test('another project with a bad id is skipped; its neighbours and their good items are kept', () => {
    const { said, skip } = lines()
    const data = readInbox(
      {
        ...readOf(),
        elsewhere: [
          { project: { id: 'uuid', name: 'Bad' }, items: [item({ id: 'b' })] },
          { project: { id: 2, name: 'Good' }, items: [item({ id: 'g' }), { ...item({ id: 'long' }), label: 'L'.repeat(500) }] },
        ],
      },
      skip,
    )
    expect(data.elsewhere.map((one) => one.project)).toEqual([{ id: 2, name: 'Good' }])
    expect(data.elsewhere[0]!.items.map((one) => one.id)).toEqual(['g'])
    expect(said.some((one) => one.includes('project.id'))).toBe(true)
    expect(said.some((one) => one.includes('label'))).toBe(true)
  })

  test('a float or negative rev and earlier are read as whole numbers, not refused', () => {
    const data = readInbox({ ...readOf(), rev: 3.7, earlier: -2 })
    expect(data.rev).toBe(3)
    expect(data.earlier).toBe(0)
  })

  test('an envelope that does not read is an error naming the field and zod’s words', () => {
    expect(() => readInbox({ items: [] })).toThrow(/inbox\.read.*\(rev: Required\)/)
    expect(() => readInbox({ rev: 1, items: 'nope' })).toThrow(/items: Expected array/)
  })

  test('the api reads through it, and a refusal of another method names the field', async () => {
    const { said, skip } = lines()
    const api = inboxApi(async (method) => (method === 'inbox.read' ? { rev: 1, items: [item({ id: 'a' }), { id: 'broken' }] } : { outcome: 'nope' }), skip)
    expect((await api.read()).items.map((one) => one.id)).toEqual(['a'])
    expect(said.length).toBe(1)
    await expect(api.open({ module: 'm', id: 'i' })).rejects.toThrow(/inbox\.open.*outcome/)
  })
})

describe('reading inbox.log', () => {
  test('keeps the rows that read and skips the rest', () => {
    const { said, skip } = lines()
    const row = { key: 'k', module: 'm', id: 'i', by: 'B', label: 'L', what: 'finished', where: '', at: 1, priority: 'normal' }
    const data = readLog({ rows: [row, { ...row, id: 'bad', at: -1 }], more: false, total: 2 }, skip)
    expect(data.rows.map((one) => one.id)).toEqual(['i'])
    expect(said[0]).toContain('at')
  })
})

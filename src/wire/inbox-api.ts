import {
  hostTooOld,
  inboxActResult,
  inboxAnswerResult,
  inboxItemSchema,
  inboxKeySchema,
  inboxLogRowSchema,
  inboxOpenResult,
  inboxUseResult,
  type InboxActResult,
  type InboxAnswerResult,
  type InboxItem,
  type InboxKey,
  type InboxLogResult,
  type InboxLogRow,
  type InboxOpenResult,
  type InboxReadResult,
  type InboxUseResult,
} from 'kehikot-module-protocol'
import { z } from 'zod'

import type { Where } from '../inbox.ts'

/**
 * The person's Inbox, asked of the host (protocol 2.79.0, `inbox:person`). Every call is the
 * frame's `request`; a page asks these and no server can. Every act but reading and `seen` is
 * taken only on the person's fresh press, so they are called straight from a click handler, never
 * from an effect or a timer — the one exception is opening the item a host's `next` named.
 *
 * A host older than 2.79.0 does not answer: `TooOld` is thrown, and the page says one sentence.
 */

/** What a host that does not answer the Inbox is said to be. */
export class TooOld extends Error {
  constructor() {
    super('This host does not answer the Inbox.')
    this.name = 'TooOld'
  }
}

/** Whether a refusal means the host is older than the Inbox. */
export const isTooOld = (error: unknown): boolean => error instanceof TooOld || hostTooOld(error) !== null

/** What the host's `request` is, as far as this file needs it. */
export type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>

export interface ActParams {
  do: 'seen' | 'dismiss' | 'forget' | 'seen-all'
  keys?: InboxKey[]
  scope?: Where
  project?: number
}

export interface InboxApi {
  read(): Promise<InboxReadResult>
  log(scope: Where, offset: number, limit: number): Promise<InboxLogResult>
  act(params: ActParams): Promise<InboxActResult>
  answer(key: InboxKey, said: { choice: string } | { answer: string }, project?: number): Promise<InboxAnswerResult>
  open(key: InboxKey, project?: number): Promise<InboxOpenResult>
  use(module: string, use: boolean): Promise<InboxUseResult>
}

/** One line for something this Inbox could not read and left out: what it was, and the field. */
export type Skip = (line: string) => void

const issueWords = (issue: z.ZodIssue | undefined): string => `${issue?.path.length ? issue.path.join('.') : 'the answer'}: ${issue?.message ?? 'malformed'}`

/** A whole number of ms or a count as this Inbox uses it; a float or a negative from an older host is read, not refused. */
const count = z.number().finite().transform((n) => (n > 0 ? Math.floor(n) : 0))

/**
 * The envelope of an answer, read leniently: the lists are read one entry at a time below, so one
 * item over a limit costs that item and not the whole Inbox.
 */
const readEnvelope = z.object({
  rev: count,
  items: z.array(z.unknown()),
  next: inboxKeySchema.nullable().catch(null).default(null),
  elsewhere: z.array(z.unknown()).catch([]).default([]),
  earlier: count.catch(0).default(0),
  muted: z.array(z.unknown()).catch([]).default([]),
})
const projectEnvelope = z.object({
  project: z.object({ id: z.number().int().positive(), name: z.string() }),
  items: z.array(z.unknown()),
})
const mutedSchema = z.object({ id: z.string().min(1), name: z.string() })
const logEnvelope = z.object({ rows: z.array(z.unknown()), more: z.boolean().catch(false), total: count.catch(0) })

/** The entries of a list that read, each one that does not said in one line naming its field. */
function each<S extends z.ZodTypeAny>(list: readonly unknown[], schema: S, what: string, skip: Skip): z.infer<S>[] {
  const out: z.infer<S>[] = []
  list.forEach((one, index) => {
    const got = schema.safeParse(one)
    if (got.success) out.push(got.data)
    else skip(`Inbox: skipped ${what} ${index}${named(one)} — ${issueWords(got.error.issues[0])}`)
  })
  return out
}

const named = (one: unknown): string => {
  if (typeof one !== 'object' || one === null) return ''
  const { module, id } = one as { module?: unknown; id?: unknown }
  return typeof module === 'string' && typeof id === 'string' ? ` (${module.slice(0, 64)} ${id.slice(0, 64)})` : ''
}

/** The error for an answer whose envelope does not read at all: the method, the field and zod's words. */
const unreadable = (method: string, error: z.ZodError): Error =>
  new Error(`The host answered ${method} in a shape this Inbox does not read (${issueWords(error.issues[0])}).`)

/**
 * `inbox.read`, read item by item: the items that fit are kept, each one that does not is skipped
 * with one line naming the field. Only an envelope that does not read is an error.
 */
export function readInbox(data: unknown, skip: Skip = defaultSkip): InboxReadResult {
  const envelope = readEnvelope.safeParse(data)
  if (!envelope.success) throw unreadable('inbox.read', envelope.error)
  const { rev, items, next, elsewhere, earlier, muted } = envelope.data
  return {
    rev,
    items: each(items, inboxItemSchema, 'item', skip) as InboxItem[],
    next,
    elsewhere: each(elsewhere, projectEnvelope, 'project', skip).map(({ project, items: theirs }) => ({
      project,
      items: each(theirs, inboxItemSchema, `item of ${project.name.slice(0, 60)}`, skip) as InboxItem[],
    })),
    earlier,
    muted: each(muted, mutedSchema, 'muted module', skip),
  }
}

/** `inbox.log`, read row by row, as `readInbox` is. */
export function readLog(data: unknown, skip: Skip = defaultSkip): InboxLogResult {
  const envelope = logEnvelope.safeParse(data)
  if (!envelope.success) throw unreadable('inbox.log', envelope.error)
  return { rows: each(envelope.data.rows, inboxLogRowSchema, 'row', skip) as InboxLogRow[], more: envelope.data.more, total: envelope.data.total }
}

const defaultSkip: Skip = (line) => console.warn(line)

const withProject = <T extends object>(params: T, project?: number): T & { project?: number } =>
  project === undefined ? params : { ...params, project }

export function inboxApi(request: Request, skip: Skip = defaultSkip): InboxApi {
  async function call(method: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      return await request(method, params)
    } catch (error) {
      if (hostTooOld(error)) throw new TooOld()
      throw error
    }
  }
  async function ask<S extends z.ZodTypeAny>(method: string, params: Record<string, unknown>, schema: S): Promise<z.infer<S>> {
    const data = await call(method, params)
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw unreadable(method, parsed.error)
    return parsed.data
  }
  return {
    read: async () => readInbox(await call('inbox.read', {}), skip),
    log: async (scope, offset, limit) => readLog(await call('inbox.log', { scope, offset, limit }), skip),
    act: (params) => ask('inbox.act', { ...params }, inboxActResult),
    answer: (key, said, project) => ask('inbox.answer', withProject({ module: key.module, id: key.id, ...said }, project), inboxAnswerResult),
    open: (key, project) => ask('inbox.open', withProject({ module: key.module, id: key.id }, project), inboxOpenResult),
    use: (module, use) => ask('inbox.use', { module, use }, inboxUseResult),
  }
}

/** Whether a host's greeting says it will not answer the Inbox: it named what it answers, without `inbox.read`. */
export const answersNoInbox = (answers: readonly string[] | null | undefined): boolean => Array.isArray(answers) && !answers.includes('inbox.read')

/** A thrown thing in one sentence. */
export const sentence = (error: unknown): string => (error instanceof Error ? error.message : String(error))

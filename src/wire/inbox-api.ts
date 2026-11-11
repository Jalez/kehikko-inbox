import {
  hostTooOld,
  inboxActResult,
  inboxAnswerResult,
  inboxLogResult,
  inboxOpenResult,
  inboxReadResult,
  inboxUseResult,
  type InboxActResult,
  type InboxAnswerResult,
  type InboxKey,
  type InboxLogResult,
  type InboxOpenResult,
  type InboxReadResult,
  type InboxUseResult,
} from 'kehikot-module-protocol'
import type { z } from 'zod'

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

const withProject = <T extends object>(params: T, project?: number): T & { project?: number } =>
  project === undefined ? params : { ...params, project }

export function inboxApi(request: Request): InboxApi {
  async function ask<S extends z.ZodTypeAny>(method: string, params: Record<string, unknown>, schema: S): Promise<z.infer<S>> {
    let data: unknown
    try {
      data = await request(method, params)
    } catch (error) {
      if (hostTooOld(error)) throw new TooOld()
      throw error
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw new Error(`The host answered ${method} in a shape this Inbox does not read.`)
    return parsed.data
  }
  return {
    read: () => ask('inbox.read', {}, inboxReadResult),
    log: (scope, offset, limit) => ask('inbox.log', { scope, offset, limit }, inboxLogResult),
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

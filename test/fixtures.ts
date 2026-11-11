import { inboxItemSchema, inboxReadResult, type InboxItem, type InboxReadResult } from 'kehikot-module-protocol'

/** One item of the record, as a host would send it. */
export function item(over: Partial<InboxItem> & Pick<InboxItem, 'id'>): InboxItem {
  return inboxItemSchema.parse({
    module: 'kehikot.claude',
    by: 'Claude',
    state: 'attention',
    label: `item ${over.id}`,
    where: 'part 1 · Wide · Auth',
    entered: 1_000,
    ...over,
  })
}

export function readOf(over: Partial<InboxReadResult> = {}): InboxReadResult {
  return inboxReadResult.parse({ rev: 1, items: [], next: null, elsewhere: [], earlier: 0, muted: [], ...over })
}

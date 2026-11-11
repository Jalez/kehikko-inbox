# kehikko-inbox

**Inbox**, a module a Kehikot host frames: what the modules on this computer need from you, are
doing and have said, in one list — and where you answer, dismiss or go to each thing.

```
./run.sh                # serves on 127.0.0.1:7910 (or the next free port)
bun test && bun run typecheck && bun run check:rows
```

It used to be Notifications (`kehikot.notifications`). That id is on the host's retired list, so
this is a new module, `kehikot.inbox`, from 2.0.0.

## What it is

The host keeps ONE record of what modules report with `activity.set`: what needs the person, what
is working, what finished. Until protocol 2.79.0 only the host drew it, in its bar. This module
draws it on a kehikko instead, under the capability `inbox:person`:

- `inbox.read` — the record of the project the frame stands in, the other projects' live items,
  what Next goes to, how much is in Earlier, and the muted modules.
- `inbox.log` — Earlier, a page at a time.
- `inbox.act` (seen, dismiss, forget, seen-all), `inbox.answer`, `inbox.open`, `inbox.use` — the
  person's acts. A host takes every one but `seen` only on the person's fresh press in the frame,
  so the page calls them straight from click handlers, never from an effect or a timer. A
  `declined` outcome carries the host's sentence, which the page shows.
- `kehikot.inbox` from the host: `changed` (read again) and `next` (the person pressed
  Alt+Shift+N in the host: open that item at once — allowed without a press for a few seconds —
  and highlight its row; `next: null` says "Nothing needs you").

It keeps nothing of its own and has no tools for agents: the record is the host's, and only the
person acts on it. Agents read it with the host's `read_inbox`.

On a host older than 2.79.0 none of these is answered: the page says one sentence — the Inbox is
in Kehikot's bar until Kehikot is updated — and draws nothing else.

## The page

- **Needs you** (urgent first, then the longest waiting), **Working**, **Finished** (unseen,
  newest first), **This project** (in "This kehikko", what is about the whole project),
  **In <project>** for each other project, and **Earlier** (collapsed; what finished and was
  seen, then the log, paged, each row forgettable, and "Forget what is shown").
- Each row says WHO before what (`<by> · <state>`), then the label, the place and the age. Urgent
  is said in words. A dot always stands beside its state in words: never colour alone. Attention
  is amber, the same as the host bar's count.
- Every string is text: never rendered as markup or a link, and no URL in one is ever opened.
- **Header** (`kehikot.header`): Show — Everything / Needs you only; Where — Everywhere / This
  kehikko. The module's own state, kept per container by the client's kept view (`state:keep`).
- **Footer** (`kehikot.footer`): the count ("2 need you · 1 working") and **Next** beside it. A host
  that draws no footer gets the same row drawn by the page.
- **A small container** (under 96 px high): the count and the most pressing item on one pressable line.

## Files

- `manifest.ts` — id, port, capabilities, help.
- `src/inbox.ts` — the rules, pure: sections, order, folding, words, counts, the small line.
- `src/header.ts`, `src/footer.ts` — what the module declares to the host.
- `src/wire/inbox-api.ts` — the six methods over the frame's `request`, and the old-host check.
- `src/app.tsx` — the page; `src/components/parts.tsx` — rows, dots, the question card.
- `doors.ts` — the health check (no store, no MCP door).
- `kehikot.rows.json` — the header and footer per state, for `kehikot-check-rows` in CI.

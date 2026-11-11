import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'kehikot-module-protocol'
import pkg from './package.json'

/**
 * A new id, not `kehikot.notifications`: that one is on the host's retired list, so every app
 * already took its containers away and an older app would retire anything with it again.
 */
export const ID = 'kehikot.inbox'
/** The module's version: package.json's, the one place it is written. A release is tagged with it. */
export const VERSION: string = pkg.version

/**
 * Where this module would like to answer: the port Notifications had, which no module on the
 * host's list uses. A preference, not a promise: `serves()` moves to the next free port when
 * something else has it, and rewrites the registration to match.
 */
export const PREFERRED_PORT = 7910

/**
 * What this module says about itself when a host asks.
 *
 * The record is the HOST's: what modules report with `activity.set`, kept per project. This
 * module keeps nothing of its own. It reads that record (`inbox.read`, `inbox.log`) and, on the
 * person's press, acts on it for them (`inbox.act`, `inbox.answer`, `inbox.open`, `inbox.use`) —
 * all under `inbox:person` (protocol 2.79.0). `state:keep` is for the kept view: the header's
 * two switches and the scroll position, per container.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  protocol: PROTOCOL,
  id: ID,
  name: 'Inbox',
  /* A key of the protocol's module icons, never a path or a URL. */
  icon: 'lucide:inbox',
  version: VERSION,
  tags: ['agents'],
  summary: 'What the modules need from you, are doing and have said — answer, dismiss or go to each one.',
  guidance:
    'The Inbox on this kehikko shows the person what modules reported with activity.set: what needs them, ' +
    'what is working and what finished. Only the person acts on it. To put something in it, report it ' +
    'from your module; to read it, use the host’s own read_inbox tool.',
  entry: '/app',
  modes: [
    {
      id: 'inbox',
      label: 'Inbox',
      scope: 'project',
      scopeSays: 'what needs you, is working and finished in this project, and what needs you in your other projects',
    },
  ],
  extensions: { emits: [], consumes: [] },
  reacts: [],
  partless: 'The Inbox is the person’s across every epic and kehikko of the project; it sits above any one epic’s parts.',
  help: {
    summary: 'What the modules need from you, are doing and have said, in one list.',
    sections: [
      {
        title: 'Reading it',
        points: [
          'Needs you comes first, urgent before the longest waiting; then Working and Finished.',
          'Each row says who said it, then what, where and how long ago.',
          'Earlier holds what closed. Open it to see the log, and forget what you no longer want there.',
        ],
      },
      {
        title: 'Acting on it',
        points: [
          'Press a row to go to where it happened.',
          'Answer a question with one of its choices, or type your own reply.',
          'The X dismisses a row; it comes back only if it changes.',
          'Next in the footer goes to the next thing that needs you, as Alt+Shift+N does.',
        ],
      },
      {
        title: 'Choosing what it shows',
        points: [
          'The header switches between everything and only what needs you, and between this kehikko and everywhere.',
          'Stop showing a module from its row; the foot of the list shows it again.',
        ],
      },
    ],
  },
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['inbox:person', 'state:keep'],
    /* Framed with `allow-same-origin`, so the page's own calls to its server are same-origin and
       need no permissive CORS header. It keeps nothing. */
    storage: true,
  },
  health: '/healthz',
})

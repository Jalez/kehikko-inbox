# Inbox — notes for agents

- The Inbox record is the HOST's. This module reads it and acts on it for the person through the
  protocol's `inbox.*` methods (`inbox:person`, protocol 2.79.0). Never add a store, a seen set in
  browser storage, or a second list of items here.
- Every act but reading and `seen` is the person's: call `inbox.act`, `inbox.answer`, `inbox.open`
  and `inbox.use` straight from a click handler (or the host's footer press, or within the host's
  window after a `next` signal), never from an effect or a timer. Show a `declined` outcome's `why`.
- A module's strings are text. Never render a label, place, question or reason as markup or a link,
  and never open a URL from one.
- Never colour alone: a dot stands beside its state in words. Attention is amber
  (`text-amber-600 dark:text-amber-400`), the host bar's colour.
- When the header or footer changes, regenerate `kehikot.rows.json` (the test in
  `test/module.test.ts` holds it to the code) and run `bun run check:rows`.

## Releasing

Kehikot installs and updates this module from its GitHub releases, not from `main`.
Nobody tags by hand: merging the version bump is the release.

1. Bump `version` in `package.json` (semver). It is the only place the version
   is written: the manifest reads it.
2. Write `notes/<version>.md`, starting with `Kind: breaking | feature | fix`
   (see `notes/README.md`). CI checks the bump matches the kind.
3. Open a PR with both; merge it.
4. On that push to `main`, `.github/workflows/release.yml` (the shared
   `module-release.yml` in Jalez/kehikko-desktop) tags `v<version>` on the merge
   commit, typechecks, tests and publishes the release "Inbox <version>".

/* The shared test preload (protocol 2.104.0): the running app's environment never reaches a test. */
import 'kehikot-module-protocol/testing/setup'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

/* A document for the tests that render one; the pure tests do not care. Bun's own fetch, Request,
   Response and Headers are kept: the door tests use them. */
const own = { fetch: globalThis.fetch, Request: globalThis.Request, Response: globalThis.Response, Headers: globalThis.Headers }
GlobalRegistrator.register()
Object.assign(globalThis, own)

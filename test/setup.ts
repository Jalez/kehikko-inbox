import { GlobalRegistrator } from '@happy-dom/global-registrator'

/* A document for the tests that render one; the pure tests do not care. Bun's own fetch, Request,
   Response and Headers are kept: the door tests use them. */
const own = { fetch: globalThis.fetch, Request: globalThis.Request, Response: globalThis.Response, Headers: globalThis.Headers }
GlobalRegistrator.register()
Object.assign(globalThis, own)

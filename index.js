/**
 * dsh-leftpanel — host half.
 *
 * A standard DSH plugin: named exports `name` / `apply`, no Config, no
 * dependencies. It owns exactly two jobs, both about the left sidebar's shape:
 * remember which panel entries the user has hidden, and remember whether the
 * "集合" (collection) mode is on plus which entry it currently shows. Both are
 * handed to the browser half through one document.
 *
 * Why a host half at all: the sidebar row list is composed in the browser, but
 * the hidden set has to survive a reload and be readable before the first row
 * paints. Persisting it here (not in `localStorage`) keeps one source of truth
 * per profile and lets the browser half read synchronously enough on boot.
 *
 * Storage is a single JSON file under the Harness home. It is private to this
 * plugin: nothing else reads or writes it, and a corrupt file degrades to
 * "nothing hidden" rather than an error the page would have to render.
 *
 * Routes are registered inside the Connection's authentication fence (like
 * every other host route), so only an authenticated page of this host can read
 * or change the set. In a headless profile there is no Connection and the
 * plugin simply stays inert.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** Package name; also the client module id and the Loader row's plugin name. */
export const name = '@xirizhi/dsh-leftpanel'

/** The plugin runs without optional services; `connection` is injected locally. */
export const inject = []

/** Route the browser half reads and writes. */
export const STATE_PATH = '/api/left-panel/state'

/** Shape version of the persisted document. */
export const STATE_VERSION = 1

/**
 * Default of the collection setting.
 *
 * Collection mode is what a fresh install gets: the panel rows collapse into a
 * single "集合" row, so a new profile starts quiet instead of showing every
 * plugin entry it happens to have loaded. It is a presentation choice only —
 * switching it off restores the plain row list, and nothing is unregistered.
 */
export const COLLECTION_DEFAULT = Object.freeze({ enabled: true, selectedId: null })

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const store = createStateStore({ homeDir: resolveHome(), logger: { warn: (message) => warn(ctx, message) } })

  ctx.inject(['connection'], (scoped) => {
    const conn = scoped.connection
    if (conn === undefined || conn === null || conn.fetch === undefined) return
    // The scoped context owns the effect so the route disappears with the
    // Connection; fall back to the root context if this Cordis build hands over
    // a plain object.
    const effect = typeof scoped.effect === 'function' ? scoped.effect.bind(scoped) : ctx.effect.bind(ctx)
    try {
      effect(
        () =>
          conn.fetch.register({
            path: STATE_PATH,
            methods: ['GET', 'POST'],
            requestBody: 'buffered',
            fetch: (request) => handleState(request, store, ctx),
          }),
        'left-panel: state route',
      )
    } catch (error) {
      warn(ctx, `state route registration skipped: ${messageOf(error)}`)
    }
  })
}

/**
 * Answer one state request.
 *
 * `GET` returns the current document. `POST` replaces the hidden set with the
 * posted one and returns the document it stored, so the browser half never has
 * to guess what was accepted.
 * @param {Request} request
 * @param {ReturnType<typeof createStateStore>} store
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Promise<Response>}
 */
async function handleState(request, store, ctx) {
  try {
    const method = String(request?.method ?? 'GET').toUpperCase()
    if (method === 'GET') return jsonResponse(await store.read())
    if (method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, 405)

    let payload
    try {
      payload = JSON.parse(await request.text())
    } catch {
      return jsonResponse({ error: 'unreadable-body' }, 400)
    }
    const current = await store.read()
    return jsonResponse(
      await store.write(
        payload?.hidden === undefined ? current.hidden : normalizeHidden(payload.hidden),
        payload?.collection === undefined ? current.collection : normalizeCollection(payload.collection),
      ),
    )
  } catch (error) {
    warn(ctx, `state request failed: ${messageOf(error)}`)
    return jsonResponse({ error: 'state-failed', hidden: [] }, 200)
  }
}

/**
 * The persisted document, as a lazily-loaded cache.
 *
 * Reads are cheap after the first one. Writes are serialised through a single
 * promise chain so two rapid toggles cannot interleave a stale read with a
 * fresh write, and each write lands atomically (temp file + rename) so a crash
 * mid-write cannot leave a truncated document behind.
 * @param {{ homeDir: string, logger: { warn: (message: string) => void } }} options
 * @returns {{ read: () => Promise<{ version: number, hidden: string[], collection: { enabled: boolean, selectedId: string | null } }>, write: (hidden: string[], collection?: { enabled: boolean, selectedId: string | null }) => Promise<{ version: number, hidden: string[], collection: { enabled: boolean, selectedId: string | null } }> }}
 */
export function createStateStore({ homeDir, logger }) {
  const file = join(homeDir, 'left-panel.json')
  /** @type {{ version: number, hidden: string[], collection: { enabled: boolean, selectedId: string | null } } | undefined} */
  let cache
  /** @type {Promise<unknown>} */
  let chain = Promise.resolve()

  /** @returns {Promise<{ version: number, hidden: string[], collection: { enabled: boolean, selectedId: string | null } }>} */
  async function load() {
    if (cache !== undefined) return cache
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      cache = {
        version: STATE_VERSION,
        hidden: normalizeHidden(parsed?.hidden),
        // A file written before collection mode existed has no `collection`
        // key; it reads as the default rather than as "off".
        collection: normalizeCollection(parsed?.collection),
      }
    } catch (error) {
      // A missing file is the normal first run; a broken one is data, not a
      // transport failure — start clean and say so once in the log.
      if (error?.code !== 'ENOENT') logger.warn(`ignoring unreadable state file: ${messageOf(error)}`)
      cache = { version: STATE_VERSION, hidden: [], collection: { ...COLLECTION_DEFAULT } }
    }
    return cache
  }

  return {
    read: load,
    write(hidden, collection) {
      const next = {
        version: STATE_VERSION,
        hidden: normalizeHidden(hidden),
        // A hidden-only write must not reset the collection setting: an omitted
        // field means "leave it as it is", not "restore the default".
        collection:
          collection === undefined
            ? (cache?.collection ?? { ...COLLECTION_DEFAULT })
            : normalizeCollection(collection),
      }
      chain = chain.then(async () => {
        cache = next
        await mkdir(dirname(file), { recursive: true })
        const temp = `${file}.tmp-${process.pid}-${Date.now()}`
        await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
        await rename(temp, file)
      })
      return chain.then(() => next)
    },
  }
}

/**
 * Coerce anything into the id list this plugin stores.
 *
 * Ids are slot entry ids: short, printable, no whitespace. Anything else is
 * dropped rather than rejected, so a hand-edited file cannot wedge the page.
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeHidden(value) {
  if (!Array.isArray(value)) return []
  /** @type {Set<string>} */
  const ids = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (id === '' || id.length > 120 || /\s/.test(id)) continue
    ids.add(id)
  }
  return [...ids].sort()
}

/**
 * Coerce anything into the collection setting.
 *
 * `enabled` defaults to on: a document that never carried the key (every file
 * written before this feature existed) must behave like a fresh install, not
 * like a user who turned it off. A `selectedId` that is not a clean slot id is
 * dropped rather than repaired, so a hand-edited file cannot make the row
 * render something arbitrary.
 * @param {unknown} value
 * @returns {{ enabled: boolean, selectedId: string | null }}
 */
export function normalizeCollection(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const enabled = source.enabled === undefined ? COLLECTION_DEFAULT.enabled : source.enabled === true
  const raw = typeof source.selectedId === 'string' ? source.selectedId.trim() : ''
  const selectedId = raw === '' || raw.length > 120 || /\s/.test(raw) ? null : raw
  return { enabled, selectedId }
}

/**
 * Resolve the Harness home the same way the rest of DSH does: an explicit
 * `DSH_HOME` wins, otherwise `<home>/.dsh`.
 * @returns {string}
 */
function resolveHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    const value = fromEnv.trim()
    return resolve(value === '~' ? homedir() : value.replace(/^~(?=[/\\])/, homedir()))
  }
  return join(homedir(), '.dsh')
}

/**
 * @param {unknown} payload
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** @param {unknown} error @returns {string} */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {string} text */
function warn(ctx, text) {
  try {
    ctx.logger?.warn?.(`[left-panel] ${text}`)
  } catch {
    // A missing logger must never be the reason a plugin fails.
  }
}

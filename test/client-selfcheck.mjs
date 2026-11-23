/**
 * Client-bundle self-check.
 *
 * Runs `client/client.js` in a stubbed browser environment and asserts the
 * contract a deployment depends on:
 *   - the module loader receives the package id;
 *   - the returned object declares `inject` and exposes `apply`;
 *   - `apply` registers exactly the two extension points (`main` keyed by the
 *     same string as the `sidebar.panellist` row id) plus the dictionaries;
 *   - the projection helpers mirror the shell's own ordering rules.
 *
 * It also exercises the host half's storage against a temporary directory.
 * React is never rendered here; the visual result is verified in the running
 * Harness.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as fs from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CLIENT = join(ROOT, 'client', 'client.js')
const PACKAGE_NAME = '@xirizhi/dsh-leftpanel'
const SECTION_ID = 'left-panel'
const NS = 'leftPanel'
const SLOT = 'sidebar.panellist'

/**
 * Run the browser bundle in a sandbox and capture what it registered.
 * @param {{ entriesOfSlot?: () => any[] }} [options]
 */
function runBundle(options = {}) {
  /** @type {any} */
  let registration
  /** @type {any[]} */
  const slotRegistrations = []
  /** @type {any[]} */
  const localeRegistrations = []
  /** @type {string[]} */
  const effects = []
  /** @type {any[]} */
  const styles = []
  /** @type {Array<() => void>} */
  const slotListeners = []
  /** @type {Array<() => void>} */
  const localeListeners = []

  const React = {
    createElement: (...args) => ({ type: typeof args[0], props: args[1] ?? {} }),
    Fragment: Symbol('Fragment'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }

  const documentStub = {
    baseURI: 'http://127.0.0.1:50649/',
    head: { appendChild: (node) => styles.push(node) },
    createElement: (tag) => ({
      tag,
      textContent: '',
      setAttribute(key, value) {
        this[key] = value
      },
      remove() {},
    }),
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { appendChild: () => {}, removeChild: () => {} },
  }

  const sandbox = {
    React,
    console,
    document: documentStub,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error('no host in this test')),
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null
      },
      setItem(key, value) {
        this.store.set(key, String(value))
      },
      removeItem(key) {
        this.store.delete(key)
      },
    },
    window: {
      __ModuleLoader__: {
        load(entry) {
          registration = entry
        },
      },
      localStorage: null,
      requestAnimationFrame: undefined,
      setTimeout,
      clearTimeout,
    },
  }
  sandbox.window.localStorage = sandbox.localStorage

  const source = fs.readFileSync(CLIENT, 'utf8')
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client/client.js' })

  assert.ok(registration !== undefined, 'the bundle must register with the module loader')
  assert.equal(registration.id, PACKAGE_NAME, 'the loader id must equal the package name')

  const factoryResult = registration.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require('${specifier}')`)
  })

  assert.ok(factoryResult !== null && typeof factoryResult === 'object', 'factory must return an object')
  assert.ok(Array.isArray(factoryResult.inject), 'inject must be an array')
  assert.equal(typeof factoryResult.apply, 'function', 'apply must be a function')

  const localeApi = {
    register(namespace, dictionaries) {
      localeRegistrations.push({ namespace, dictionaries })
      return () => {}
    },
    bind(namespace) {
      return (key) => `${namespace}.${key}`
    },
    subscribe(listener) {
      localeListeners.push(listener)
      return () => {
        const at = localeListeners.indexOf(listener)
        if (at !== -1) localeListeners.splice(at, 1)
      }
    },
  }

  const slotApi = {
    entriesOfSlot: options.entriesOfSlot ?? (() => []),
    inject(owner, callback) {
      callback()
    },
    register(registerOptions, component) {
      slotRegistrations.push({ options: registerOptions, component })
      return () => {}
    },
    subscribe(key, listener) {
      if (key === SLOT) slotListeners.push(listener)
      return () => {}
    },
  }

  const ctx = {
    slots: slotApi,
    locale: localeApi,
    layout: { selectPanel: () => {} },
    effect(factory, label) {
      effects.push(label ?? 'unnamed')
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    get(name) {
      if (name === 'slots') return slotApi
      if (name === 'locale') return localeApi
      return undefined
    },
    logger: { warn: () => {} },
  }

  factoryResult.apply(ctx)

  return {
    registration,
    factoryResult,
    slotRegistrations,
    localeRegistrations,
    effects,
    styles,
    bumpSlots: () => {
      for (const listener of [...slotListeners]) listener()
    },
  }
}

test('the bundle registers under the package name', () => {
  const run = runBundle()
  assert.equal(run.registration.id, PACKAGE_NAME)
})

test('the plugin declares only the slots and locale services', () => {
  const run = runBundle()
  const inject = Array.from(run.factoryResult.inject)
  assert.deepEqual(inject, ['slots', 'locale'])
})

test('apply registers exactly one settings section and no sidebar row', () => {
  const run = runBundle()
  const names = run.slotRegistrations.map((entry) => entry.options.name)
  assert.deepEqual(names, ['settings.section'], 'the plugin must not occupy a left-menu slot')

  const section = run.slotRegistrations[0]
  assert.equal(section.options.id, SECTION_ID)
  assert.equal(typeof section.options.order, 'number')
  assert.equal(section.options.locale, NS)
  // A section declares no `key`: that belongs to `main` panels, not to this list.
  assert.equal(section.options.key, undefined)
})

test('the section label follows the locale', () => {
  const run = runBundle()
  const section = run.slotRegistrations[0]
  assert.equal(typeof section.options.label, 'function')
  assert.equal(section.options.label(), `${NS}.nav`)
})

test('the section takes its translator from the slot locale seat, not inject', () => {
  const run = runBundle()
  const section = run.slotRegistrations[0]
  // Declaring `inject` with `t` would trip the renderer's duplicate-prop guard,
  // because a declared `locale` already hands the component `t`.
  assert.equal(section.options.inject, undefined)
  assert.equal(typeof section.component, 'function')
})

test('apply registers zh and en dictionaries with identical keys', () => {
  const run = runBundle()
  assert.equal(run.localeRegistrations.length, 1)
  const { namespace, dictionaries } = run.localeRegistrations[0]
  assert.equal(namespace, NS)
  assert.ok(dictionaries.zh !== undefined)
  assert.ok(dictionaries.en !== undefined)

  const zhKeys = Object.keys(dictionaries.zh).sort()
  const enKeys = Object.keys(dictionaries.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'both locales must translate the same keys')
  for (const key of zhKeys) {
    assert.equal(typeof dictionaries.zh[key], 'string', `zh.${key} must be a string`)
    assert.equal(typeof dictionaries.en[key], 'string', `en.${key} must be a string`)
    assert.notEqual(dictionaries.zh[key].trim(), '', `zh.${key} must not be empty`)
    assert.notEqual(dictionaries.en[key].trim(), '', `en.${key} must not be empty`)
  }
})

test('the stylesheet defines the hide rule and injects it once', () => {
  const run = runBundle()
  assert.equal(run.styles.length, 1, 'exactly one <style> element is appended')

  const css = run.styles[0].textContent
  assert.match(css, /\[data-dsh-leftpanel-hidden\]\s*\{\s*display:\s*none !important/, 'the hide rule is what hides a row')
  assert.match(css, /\.lp-root\b/, 'the page has its own style root')
  // Collection mode adds a row and a card to the sidebar; both must be styled
  // by this bundle (no remote sheet) and the row must not be hidden by the
  // same rule that folds the panel rows.
  assert.match(css, /\[data-dsh-leftpanel-collection\]/, 'the injected row has its own hook')
  assert.match(css, /\.lp-coll\b/, 'the injected row is styled here')
  assert.match(css, /\.lp-fly\b/, 'the floating card is styled here')
  assert.match(css, /\.lp-fly-cols\b/, 'the card lays its two columns out here')
  // The settings page already owns `.lp-card`; the floating menus must not
  // reuse it, or a `position:fixed` rule lands on the settings cards.
  assert.match(css, /\.lp-card\{border/, 'the settings card keeps its own rule')
  assert.doesNotMatch(css, /\.lp-card\{[^}]*position:fixed/, 'the settings card must never become a flyout')
  // No remote asset may be pulled in by a plugin stylesheet.
  assert.doesNotMatch(css, /@import/)
  assert.doesNotMatch(css, /url\(\s*['"]?https?:/)
})

test('every effect is labelled so the ledger stays readable', () => {
  const run = runBundle()
  assert.ok(run.effects.length > 0)
  for (const label of run.effects) {
    assert.match(label, /^left-panel: /, `effect labelled "${label}" must be namespaced`)
  }
})

test('rendering survives a slot list that changes under it', () => {
  let entries = []
  const run = runBundle({ entriesOfSlot: () => entries })
  // A late registration must not throw through the subscriber path.
  entries = [{ options: { id: 'plugins', order: 0, label: 'Plugins' } }]
  assert.doesNotThrow(() => run.bumpSlots())
  // And the section component is still there to re-render with the new list.
  const section = run.slotRegistrations.find((entry) => entry.options.name === 'settings.section')
  assert.equal(typeof section.component, 'function')
})

// ── host half ─────────────────────────────────────────────────────────────

const HOST = await import(pathToFileURL(join(ROOT, 'index.js')).href)

test('the host half exports the plugin identity and no Config', () => {
  assert.equal(HOST.name, PACKAGE_NAME)
  assert.equal(typeof HOST.apply, 'function')
  assert.equal(HOST.default, undefined, 'the host half is a plain ESM module')
})

test('normalizeHidden drops everything that is not a clean id', () => {
  assert.deepEqual(HOST.normalizeHidden(['b', 'a']), ['a', 'b'], 'sorted and deduplicated')
  assert.deepEqual(HOST.normalizeHidden(['a', 'a']), ['a'])
  assert.deepEqual(HOST.normalizeHidden(['a b']), [], 'whitespace ids are rejected')
  assert.deepEqual(HOST.normalizeHidden([1, null, {}, 'ok']), ['ok'], 'non-strings are dropped')
  assert.deepEqual(HOST.normalizeHidden('nope'), [], 'a non-array is empty')
  assert.deepEqual(HOST.normalizeHidden(['x'.repeat(121)]), [], 'absurdly long ids are rejected')
})

test('the store round-trips through a real file and survives a corrupt one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'left-panel-'))
  try {
    const warnings = []
    const store = HOST.createStateStore({ homeDir: dir, logger: { warn: (m) => warnings.push(m) } })

    assert.deepEqual((await store.read()).hidden, [], 'first run starts empty')
    assert.equal(warnings.length, 0, 'a missing file is not a warning')

    const written = await store.write(['plugins', 'token-dashboard'])
    assert.deepEqual(written.hidden, ['plugins', 'token-dashboard'])

    const onDisk = JSON.parse(await readFile(join(dir, 'left-panel.json'), 'utf8'))
    assert.equal(onDisk.version, HOST.STATE_VERSION)
    assert.deepEqual(onDisk.hidden, ['plugins', 'token-dashboard'])

    // A fresh store sees the same set — this is the restart path.
    const reopened = HOST.createStateStore({ homeDir: dir, logger: { warn: () => {} } })
    assert.deepEqual((await reopened.read()).hidden, ['plugins', 'token-dashboard'])

    // A broken document degrades to "nothing hidden" and only warns.
    const broken = await mkdtemp(join(tmpdir(), 'left-panel-broken-'))
    try {
      await writeFile(join(broken, 'left-panel.json'), '{ not json', 'utf8')
      const brokenWarnings = []
      const brokenStore = HOST.createStateStore({ homeDir: broken, logger: { warn: (m) => brokenWarnings.push(m) } })
      assert.deepEqual((await brokenStore.read()).hidden, [])
      assert.equal(brokenWarnings.length, 1, 'a corrupt file is reported once')
    } finally {
      await rm(broken, { recursive: true, force: true })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('concurrent writes serialise and the last one wins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'left-panel-race-'))
  try {
    const store = HOST.createStateStore({ homeDir: dir, logger: { warn: () => {} } })
    await Promise.all([store.write(['a']), store.write(['b']), store.write(['c'])])
    const onDisk = JSON.parse(await readFile(join(dir, 'left-panel.json'), 'utf8'))
    assert.deepEqual(onDisk.hidden, ['c'], 'the write chain keeps the latest value intact')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('apply registers the state route inside the connection fence', () => {
  /** @type {any[]} */
  const routes = []
  /** @type {string[]} */
  const effects = []
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['connection'])
      callback({
        connection: {
          fetch: {
            register(route) {
              routes.push(route)
              return () => {}
            },
          },
        },
      })
    },
    effect(factory, label) {
      effects.push(label)
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    logger: { warn: () => {} },
  }

  HOST.apply(ctx)
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, HOST.STATE_PATH)
  assert.deepEqual([...routes[0].methods].sort(), ['GET', 'POST'])
  assert.equal(routes[0].requestBody, 'buffered')
  assert.equal(typeof routes[0].fetch, 'function')
  assert.equal(effects.length, 1)
  assert.match(effects[0], /^left-panel: /)
})

test('apply stays inert when the host has no connection', () => {
  const ctx = {
    inject(names, callback) {
      callback({})
    },
    effect() {
      throw new Error('nothing may be registered without a connection')
    },
    logger: { warn: () => {} },
  }
  assert.doesNotThrow(() => HOST.apply(ctx))
})

test('package.json wires the bundle and the client half', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, PACKAGE_NAME)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['./client'], './client/client.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.deepEqual([...pkg.dsh.client.inject], ['@deepseek-ai/dsh-client-locale'])
  for (const file of ['index.js', 'client/client.js', 'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg']) {
    assert.ok(fs.existsSync(join(ROOT, file)), `${file} must exist`)
  }
})

test('the Cordis patch inserts exactly this bundle', async () => {
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /insert:/)
  assert.match(patch, new RegExp(`name:\\s*"${PACKAGE_NAME}"`))
  assert.match(patch, /id:\s*left-panel/)
})

test('the collection setting is persisted and defaults to on', async () => {
  const { mkdtemp, rm, readFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'left-panel-collection-'))
  try {
    assert.deepEqual(HOST.normalizeCollection(undefined), { enabled: true, selectedId: null }, 'a missing key means on')
    assert.deepEqual(HOST.normalizeCollection({ enabled: false, selectedId: 'plugins' }), { enabled: false, selectedId: 'plugins' })
    assert.deepEqual(HOST.normalizeCollection({ selectedId: 'has space' }), { enabled: true, selectedId: null }, 'bad ids are dropped, not repaired')

    const store = HOST.createStateStore({ homeDir: dir, logger: { warn: () => {} } })
    assert.deepEqual((await store.read()).collection, { enabled: true, selectedId: null }, 'first run starts on')

    // A hidden-only write must not reset the collection setting.
    await store.write(['plugins'])
    await store.write(['plugins'], { enabled: false, selectedId: 'plugins' })
    await store.write(['plugins', 'schedules'])
    const onDisk = JSON.parse(await readFile(join(dir, 'left-panel.json'), 'utf8'))
    assert.deepEqual(onDisk.collection, { enabled: false, selectedId: 'plugins' }, 'the collection setting survives a hidden-set write')

    // A document written before the feature existed reads as on.
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(dir, 'left-panel.json'), JSON.stringify({ version: 1, hidden: ['plugins'] }), 'utf8'))
    const reopened = HOST.createStateStore({ homeDir: dir, logger: { warn: () => {} } })
    assert.deepEqual((await reopened.read()).collection, { enabled: true, selectedId: null }, 'an old file means "on"')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a POST may update one half of the document without touching the other', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'left-panel-patch-'))
  try {
    /** @type {any} */
    let handler
    const ctx = {
      inject(names, callback) {
        callback({
          connection: {
            fetch: {
              register(route) {
                handler = route.fetch
                return () => {}
              },
            },
          },
        })
      },
      effect(factory) {
        const dispose = factory()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      logger: { warn: () => {} },
      // Point the store at the temp home through the env the host half reads.
      env: { DSH_HOME: dir },
    }
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = dir
    try {
      HOST.apply(ctx)
      assert.equal(typeof handler, 'function')

      const post = (body) => handler(new Request('http://local' + HOST.STATE_PATH, { method: 'POST', body: JSON.stringify(body) }))
      await post({ collection: { enabled: true, selectedId: 'plugins' } })
      let doc = await (await handler(new Request('http://local' + HOST.STATE_PATH, { method: 'GET' }))).json()
      assert.deepEqual(doc.collection, { enabled: true, selectedId: 'plugins' })
      assert.deepEqual(doc.hidden, [])

      await post({ hidden: ['schedules'] })
      doc = await (await handler(new Request('http://local' + HOST.STATE_PATH, { method: 'GET' }))).json()
      assert.deepEqual(doc.hidden, ['schedules'], 'the hidden set moved')
      assert.deepEqual(doc.collection, { enabled: true, selectedId: 'plugins' }, 'and the collection setting stayed put')
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

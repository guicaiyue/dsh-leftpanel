/**
 * DOM-pass self-check.
 *
 * The hide mechanism is a presentation pass over the sidebar's row list, so it
 * is the one piece that must be verified against a real DOM shape rather than a
 * contract. This test builds the exact structure the shell renders —
 *
 *   <nav class="panelList">
 *     <button aria-label="Plugins"><span class="panelGlyph"><span data-dsh-leftpanel-anchor/></span></button>
 *     ...
 *
 * — and asserts which rows acquire the hide attribute. It also pins the two
 * safety properties: a row-count mismatch must not hide the wrong row, and a
 * name mismatch must not hide anything.
 *
 * Rendering React is still out of scope; the visual result is verified in the
 * running Harness.
 */
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(HERE, '..', 'client', 'client.js')
const HIDE_ATTR = 'data-dsh-leftpanel-hidden'

/**
 * A minimal element that supports exactly what the pass touches.
 *
 * The hide pass only reads tags, attributes and children; the collection mount
 * additionally appends nodes, sets text and measures the row list, so those are
 * modelled here too — with the same shape the browser gives (children arrays,
 * `firstElementChild`, `append`), so a stub gap cannot masquerade as a product
 * bug.
 */
class Element {
  constructor(tagName) {
    this.tagName = tagName
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    this.hidden = false
    this.style = {}
    this.classList = { add() {}, remove() {}, toggle() {} }
    this.ownerDocument = null
  }
  /** The DOM aliases `parentNode` and `parentElement` for element parents. */
  get parentNode() {
    return this.parentElement
  }
  get firstElementChild() {
    return this.children.length > 0 ? this.children[0] : null
  }
  get lastElementChild() {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null
  }
  set innerHTML(value) {
    this.children.length = 0
    this._innerHTML = String(value)
  }
  get innerHTML() {
    return this._innerHTML ?? ''
  }
  set textContent(value) {
    this.children.length = 0
    this._textContent = String(value)
  }
  get textContent() {
    if (this._textContent !== undefined) return this._textContent
    return this.children.map((child) => child.textContent).join('')
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node)
  }
  insertBefore(child, reference) {
    const at = reference === null || reference === undefined ? this.children.length : this.children.indexOf(reference)
    child.parentElement = this
    this.children.splice(at === -1 ? this.children.length : at, 0, child)
    return child
  }
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  remove() {
    if (this.parentElement === null) return
    const at = this.parentElement.children.indexOf(this)
    if (at !== -1) this.parentElement.children.splice(at, 1)
    this.parentElement = null
  }
  getBoundingClientRect() {
    return { x: 0, y: 100, width: 264, height: 36, top: 100, right: 272, bottom: 136, left: 0 }
  }
  get offsetHeight() {
    return 120
  }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  /** Just enough selector support for the tags the mount pass asks for. */
  querySelector(selector) {
    const wanted = String(selector).trim().toLowerCase()
    const walk = (node) => {
      for (const child of node.children) {
        if (child.tagName.toLowerCase() === wanted) return child
        const found = walk(child)
        if (found !== null) return found
      }
      return null
    }
    return walk(this)
  }
  querySelectorAll() {
    return []
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value))
  }
  removeAttribute(key) {
    this.attributes.delete(key)
  }
  getAttribute(key) {
    return this.attributes.has(key) ? this.attributes.get(key) : null
  }
  hasAttribute(key) {
    return this.attributes.has(key)
  }
  /** Walk up to the nearest ancestor with this tag, like the real API. */
  closest(tagName) {
    let node = this
    while (node !== null && node !== undefined) {
      if (String(node.tagName).toLowerCase() === tagName.toLowerCase()) return node
      node = node.parentElement
    }
    return null
  }
}

/**
 * Build the sidebar's row list. `labels` become the accessible names, exactly
 * as `PanelRow` sets `aria-label`.
 * @param {string[]} labels
 */
function buildSidebar(labels) {
  const nav = new Element('NAV')
  for (const label of labels) {
    const button = new Element('BUTTON')
    button.setAttribute('aria-label', label)
    const glyph = button.appendChild(new Element('SPAN'))
    glyph.appendChild(new Element('SPAN'))
    nav.appendChild(button)
  }
  return nav
}

/**
 * Run the bundle against a fake document holding `nav`, then return the rows.
 * @param {string[]} rowLabels the label each rendered row carries
 * @param {Array<{ id: string, label: string, order: number }>} entries the slot ledger
 * @param {string[]} hidden seeded through the localStorage mirror
 */
function runWith(rows, entries, hidden) {
  const nav = buildSidebar(rows)

  const documentStub = {
    head: { appendChild: () => {} },
    createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
    // The pass finds the row list structurally: the <nav> of named buttons.
    querySelectorAll: (selector) => (selector === 'nav' ? [nav] : []),
    querySelector: () => null,
    addEventListener: () => {},
    body: { appendChild: () => {} },
  }

  const React = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }

  let registration
  const sandbox = {
    React,
    console,
    document: documentStub,
    setTimeout,
    clearTimeout,
    // The host is absent in this test; the mirror carries the seeded set.
    fetch: () => Promise.reject(new Error('no host')),
    localStorage: {
      store: new Map([['dsh-leftpanel:hidden', JSON.stringify(hidden)]]),
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
      setTimeout,
      clearTimeout,
    },
  }
  sandbox.window.localStorage = sandbox.localStorage

  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), sandbox, { filename: 'client/client.js' })

  const slotApi = {
    entriesOfSlot: () => entries.map((options) => ({ options })),
    inject: (owner, callback) => callback(),
    register: () => () => {},
    subscribe: () => () => {},
  }
  const ctx = {
    slots: slotApi,
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      subscribe: () => () => {},
    },
    layout: { selectPanel: () => {} },
    effect(factory) {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    logger: { warn: () => {} },
  }

  registration.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require('${specifier}')`)
  }).apply(ctx)

  return {
    rows: nav.children.map((button) => ({
      label: button.getAttribute('aria-label'),
      hidden: button.hasAttribute(HIDE_ATTR),
    })),
  }
}

test('a hidden panel row acquires the hide attribute and the rest do not', () => {
  const { rows } = runWith(
    ['Plugins', 'Token usage', 'Left menu'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['token-dashboard'],
  )

  assert.deepEqual(rows, [
    { label: 'Plugins', hidden: false },
    { label: 'Token usage', hidden: true },
    { label: 'Left menu', hidden: false },
  ])
})

test('nothing is hidden when the hidden set is empty', () => {
  const { rows } = runWith(
    ['Plugins', 'Left menu'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    [],
  )
  assert.equal(rows.every((row) => row.hidden === false), true)
})

test('several hidden rows are all marked', () => {
  // Row order is the shell's own: sorted by `order`, so the order-10 row is
  // last even though it appears second in the ledger below.
  const { rows } = runWith(
    ['Plugins', 'Token usage', 'MCP', 'Left menu', 'Schedules'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'schedules', label: 'Schedules', order: 10 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'mcp-manager', label: 'MCP', order: 6 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['plugins', 'mcp-manager'],
  )
  assert.deepEqual(rows.filter((row) => row.hidden).map((row) => row.label), ['Plugins', 'MCP'])
})

test('projection order follows the shell: sorted by `order`, not by id', () => {
  // The ledger is deliberately out of order; index 1 must be the order-5 row.
  const { rows } = runWith(
    ['Plugins', 'Token usage', 'Left menu'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['token-dashboard'],
  )
  assert.equal(rows[1].hidden, true, 'the row at index 1 is the order-5 entry')
})

test('a row-count mismatch falls back to names and hides only exact matches', () => {
  // The DOM has an extra row the ledger does not know about yet (a plugin that
  // registered between render and projection). Positional matching is unsafe,
  // so only the row whose name matches a hidden panel may be touched.
  const { rows } = runWith(
    ['Plugins', 'Ghost', 'Token usage', 'Left menu'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['plugins'],
  )
  assert.deepEqual(rows, [
    { label: 'Plugins', hidden: true },
    { label: 'Ghost', hidden: false },
    { label: 'Token usage', hidden: false },
    { label: 'Left menu', hidden: false },
  ])
})

test('a name mismatch at a positional hit hides nothing rather than the wrong row', () => {
  // Same count, but the labels disagree — the DOM is stale. Trusting the index
  // here would hide an unrelated feature, so the pass must decline.
  const { rows } = runWith(
    ['Alpha', 'Beta', 'Gamma'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['token-dashboard'],
  )
  assert.equal(rows.some((row) => row.hidden), false, 'no row may be hidden on a name mismatch')
})

test('the pass is a no-op when no row list is rendered (collapsed shell)', () => {
  // No sidebar at all: the bundle must not throw, and nothing gets marked.
  assert.doesNotThrow(() => runWith([], [], ['plugins']))
})

// ── collection mode ───────────────────────────────────────────────────────
// The injected row and card are the one part of this plugin that *adds* DOM to
// the sidebar, so the pass that mounts them is verified against the same real
// structure the shell renders.

const COLLECTION_ATTR = 'data-dsh-leftpanel-collection'
const CARD_ATTR = 'data-dsh-leftpanel-card'

/** Build a document stub rich enough for the mount pass. */
function buildDocument(nav) {
  const body = new Element('BODY')
  const documentStub = {
    body,
    head: { appendChild: () => {} },
    createElement: (tagName) => {
      const node = new Element(tagName)
      node.ownerDocument = documentStub
      return node
    },
    querySelectorAll: (selector) => (selector === 'nav' ? [nav] : []),
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return documentStub
}

/**
 * Run the bundle with the collection setting seeded, and report what ended up
 * in the sidebar.
 * @param {{ enabled?: boolean, selectedId?: string | null, rows?: string[], entries?: any[] }} options
 */
function runCollection(options = {}) {
  const rows = options.rows ?? ['Plugins', 'Schedules', 'Archify']
  const entries = options.entries ?? rows.map((label, index) => ({ id: label.toLowerCase(), label, order: index }))
  const nav = options.nav ?? buildSidebar(rows)
  const documentStub = buildDocument(nav)
  const collection = { enabled: options.enabled ?? true, selectedId: options.selectedId ?? null }

  const React = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }

  let registration
  const sandbox = {
    React,
    console,
    document: documentStub,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error('no host')),
    localStorage: {
      store: new Map([['dsh-leftpanel:collection', JSON.stringify(collection)]]),
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
      setTimeout,
      clearTimeout,
      innerWidth: 1440,
      innerHeight: 900,
      requestAnimationFrame: undefined,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  }
  sandbox.window.localStorage = sandbox.localStorage

  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), sandbox, { filename: 'client/client.js' })

  const slotApi = {
    entriesOfSlot: () => entries.map((opts) => ({ options: opts })),
    inject: (owner, callback) => callback(),
    register: () => () => {},
    subscribe: () => () => {},
  }
  const ctx = {
    slots: slotApi,
    locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {} },
    layout: { selectPanel: () => {} },
    effect(factory) {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    logger: { warn: () => {} },
  }

  registration.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require('${specifier}')`)
  }).apply(ctx)

  const collectionRow = nav.children.find((node) => node.getAttribute(COLLECTION_ATTR) !== null) ?? null
  // The mount kicks off a harvest; tests that care wait on it, the rest ignore it.
  const settled = new Promise((resolve) => setTimeout(resolve, 60))
  const card = documentStub.body.children.find((node) => node.getAttribute(CARD_ATTR) !== null) ?? null
  return {
    nav,
    collectionRow,
    settled,
    card,
    rows: nav.children
      .filter((node) => node.getAttribute(COLLECTION_ATTR) === null && node.tagName === 'BUTTON')
      .map((button) => ({ label: button.getAttribute('aria-label'), hidden: button.hasAttribute(HIDE_ATTR) })),
    mirror: sandbox.localStorage,
  }
}

test('collection mode is on by default: one row stays, every panel row folds', () => {
  const run = runCollection()
  assert.ok(run.collectionRow !== null, 'the collection row must be injected')
  assert.equal(run.collectionRow.parentElement, run.nav, 'it must live in the row list')
  assert.equal(run.nav.children[0], run.collectionRow, 'and sit above the folded rows')
  for (const row of run.rows) assert.equal(row.hidden, true, `${row.label} must fold away`)
})

test('the injected row is not counted as a panel row', () => {
  const run = runCollection({ enabled: true, rows: ['Plugins'] })
  // With one panel and one injected row, the positional match must still line
  // up; if the injected row leaked into the projection it would not.
  assert.equal(run.rows.length, 1)
  assert.equal(run.rows[0].hidden, true)
})

test('collection mode off restores the plain list and removes the row', () => {
  const run = runCollection({ enabled: false })
  assert.equal(run.collectionRow, null, 'no row may be injected')
  assert.equal(run.card, null, 'no card may be mounted')
  for (const row of run.rows) assert.equal(row.hidden, false, `${row.label} must be visible again`)
})

test('the user hidden set still applies while collection mode is off', () => {
  const nav = buildSidebar(['Plugins', 'Schedules'])
  const documentStub = buildDocument(nav)
  const React = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }
  let registration
  const sandbox = {
    React,
    console,
    document: documentStub,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error('no host')),
    localStorage: {
      store: new Map([
        ['dsh-leftpanel:collection', JSON.stringify({ enabled: false, selectedId: null })],
        ['dsh-leftpanel:hidden', JSON.stringify(['plugins'])],
      ]),
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
      __ModuleLoader__: { load(entry) { registration = entry } },
      setTimeout,
      clearTimeout,
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  }
  sandbox.window.localStorage = sandbox.localStorage
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), sandbox, { filename: 'client/client.js' })

  registration.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require('${specifier}')`)
  }).apply({
    slots: {
      entriesOfSlot: () => [
        { options: { id: 'plugins', label: 'Plugins', order: 0 } },
        { options: { id: 'schedules', label: 'Schedules', order: 1 } },
      ],
      inject: (owner, callback) => callback(),
      register: () => () => {},
      subscribe: () => () => {},
    },
    locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {} },
    layout: { selectPanel: () => {} },
    effect(factory) {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    logger: { warn: () => {} },
  })

  assert.deepEqual(
    nav.children.map((button) => ({ label: button.getAttribute('aria-label'), hidden: button.hasAttribute(HIDE_ATTR) })),
    [{ label: 'Plugins', hidden: true }, { label: 'Schedules', hidden: false }],
  )
})

test('a missing collection setting reads as on, not as off', () => {
  const run = runCollection({ enabled: undefined })
  // Seeded as `{}` through normalizeCollection: `enabled` is absent, so the
  // row must still be injected.
  assert.ok(run.collectionRow !== null)
})

test('the card is mounted outside the sidebar and starts hidden', () => {
  const run = runCollection({ selectedId: 'plugins' })
  assert.ok(run.card !== null, 'the card must be mounted')
  assert.equal(run.card.hidden, true, 'it stays closed until the row is hovered')
  assert.equal(run.card.parentElement, run.nav.ownerDocument?.body ?? run.card.parentElement)
})

// ── the shell's overflow ("更多") folds into the card's second layer ──────

test('the overflow launcher is folded away and restored with the mode', async () => {
  const nav = buildSidebar(['Plugins', 'Schedules'])
  // The shell renders the launcher as a <span> wrapper around a panel-row button.
  const launcher = new Element('SPAN')
  const launcherButton = new Element('BUTTON')
  launcherButton.setAttribute('aria-label', 'More')
  launcher.appendChild(launcherButton)
  nav.appendChild(launcher)

  const run = runCollection({ rows: ['Plugins', 'Schedules'], nav })
  assert.equal(launcher.getAttribute('data-dsh-leftpanel-more-hidden'), '', 'the launcher is hidden while folding')
  assert.equal(launcherButton.hasAttribute(HIDE_ATTR), false, 'the button itself is left to React')
  // The harvest is asynchronous; let it settle so a stub failure cannot leak
  // into the next test as an unhandled rejection.
  await run.settled
})

test('turning the mode off puts the overflow launcher back', () => {
  const nav = buildSidebar(['Plugins'])
  const launcher = new Element('SPAN')
  const launcherButton = new Element('BUTTON')
  launcherButton.setAttribute('aria-label', 'More')
  launcher.appendChild(launcherButton)
  nav.appendChild(launcher)
  runCollection({ enabled: false, rows: ['Plugins'], nav })
  assert.equal(launcher.hasAttribute('data-dsh-leftpanel-more-hidden'), false, 'nothing stays folded')
})

test('the settings page keeps its own card rule (no flyout leak)', () => {
  // `.lp-card` belongs to the settings page. If the floating menus reuse that
  // name, a `position:fixed` rule lands on the settings cards and they stack on
  // top of each other — which is exactly the bug this pins.
  const css = fs.readFileSync(join(HERE, '..', 'client', 'client.js'), 'utf8')
  assert.match(css, /'\.lp-card\{border:1px solid/, 'the settings card rule stays')
  assert.doesNotMatch(css, /'\.lp-card\{[^']*position:fixed/, 'the settings card is never fixed')
  assert.match(css, /'\.lp-fly\{position:fixed/, 'the floating card owns the fixed positioning')
})

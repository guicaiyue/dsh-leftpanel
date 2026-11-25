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
 * Build the sidebar's row list in the shape the running shell renders.
 *
 * DSH 0.2.x wraps each row — `<div class="…panelEntry"><button class="…panelRow"
 * aria-label="…">…</button><button class="…panelUnpin" …></button></div>` — while
 * 0.1.x rendered the row button directly under the `<nav>`. Both shapes are
 * real (the NAS and the desktop have run different releases), so both are
 * modelled here: `wrapped` picks 0.2.x, and `launcher` adds the shell's own
 * "更多" overflow row.
 * @param {string[]} labels
 * @param {{ wrapped?: boolean, launcher?: boolean }} [options]
 */
function buildSidebar(labels, options = {}) {
  const nav = new Element('NAV')
  for (const label of labels) {
    const button = new Element('BUTTON')
    button.setAttribute('aria-label', label)
    const glyph = button.appendChild(new Element('SPAN'))
    glyph.appendChild(new Element('SPAN'))
    if (options.wrapped !== true) {
      nav.appendChild(button)
      continue
    }
    const wrapper = new Element('DIV')
    wrapper.className = 'panelEntry'
    wrapper.appendChild(button)
    // The shell renders its pin toggle inside the same wrapper; it must never be
    // mistaken for a row of its own.
    const unpin = new Element('BUTTON')
    unpin.setAttribute('aria-label', 'Unpin ' + label)
    wrapper.appendChild(unpin)
    nav.appendChild(wrapper)
  }
  if (options.launcher === true) {
    const wrapper = new Element('SPAN')
    wrapper.className = 'moreAnchor'
    const button = new Element('BUTTON')
    button.setAttribute('aria-label', 'More')
    button.setAttribute('aria-haspopup', 'menu')
    wrapper.appendChild(button)
    nav.appendChild(wrapper)
  }
  return nav
}

/**
 * Report every row of the list: the accessible name it carries and whether the
 * box the shell lays out for it is marked hidden.
 * @param {Element} nav
 */
function reportRows(nav) {
  return [...nav.children]
    .filter((node) => node.getAttribute(COLLECTION_ATTR) === null)
    .map((node) => {
      const button = node.tagName === 'BUTTON' ? node : node.firstElementChild
      return {
        label: button.getAttribute('aria-label'),
        launcher: button.getAttribute('aria-haspopup') === 'menu',
        hidden: node.hasAttribute(HIDE_ATTR),
      }
    })
}

/**
 * Run the bundle against a fake document holding `nav`, then return the rows.
 * @param {string[]} rowLabels the label each rendered row carries
 * @param {Array<{ id: string, label: string, order: number }>} entries the slot ledger
 * @param {string[]} hidden seeded through the localStorage mirror
 * @param {{ wrapped?: boolean, launcher?: boolean }} [options] which shell markup to model
 */
function runWith(rows, entries, hidden, options = {}) {
  const nav = buildSidebar(rows, options)

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
    rows: reportRows(nav).filter((row) => !row.launcher).map(({ label, hidden }) => ({ label, hidden })),
    nav,
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
  const nav = options.nav ?? buildSidebar(rows, { wrapped: options.wrapped, launcher: options.launcher })
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
    rows: reportRows(nav).filter((row) => !row.launcher).map(({ label, hidden }) => ({ label, hidden })),
    allRows: reportRows(nav),
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

// ── the shell's 0.2.x row markup ─────────────────────────────────────────
// DSH 0.2.x wraps each row in `<div class="…panelEntry">` and renders the pin
// toggle beside it. The pass must fold the wrapper — hiding only the inner
// button leaves an empty box and the pin toggle on screen — and must never read
// the pin toggle as a row of its own. This is the markup the desktop runs, so a
// pass that only understood bare `<button>` rows silently degraded to "hide
// nothing" and the left menu came back after every reload.

test('the 0.2.x wrapper shape folds the row box, not just its button', () => {
  const run = runWith(
    ['Plugins', 'Token usage', 'Left menu'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
      { id: 'left-panel', label: 'Left menu', order: 7 },
    ],
    ['token-dashboard'],
    { wrapped: true },
  )
  assert.deepEqual(run.rows, [
    { label: 'Plugins', hidden: false },
    { label: 'Token usage', hidden: true },
    { label: 'Left menu', hidden: false },
  ])
  const marked = [...run.nav.children].filter((node) => node.hasAttribute(HIDE_ATTR))
  assert.equal(marked.length, 1, 'exactly one row box is marked')
  assert.equal(marked[0].tagName, 'DIV', 'the wrapper is the element that gets marked')
  assert.equal(marked[0].firstElementChild.getAttribute('aria-label'), 'Token usage')
  assert.equal(marked[0].firstElementChild.hasAttribute(HIDE_ATTR), false, 'the row button itself is left alone')
})

test('the 0.2.x pin toggle is never counted as a panel row', () => {
  // Every wrapper holds the row button plus a pin toggle; a pass that matched
  // *any* descendant button would see twice as many rows as the projection and
  // decline to hide anything.
  const run = runWith(
    ['Plugins', 'Token usage'],
    [
      { id: 'plugins', label: 'Plugins', order: 0 },
      { id: 'token-dashboard', label: 'Token usage', order: 5 },
    ],
    ['plugins'],
    { wrapped: true },
  )
  assert.deepEqual(run.rows, [
    { label: 'Plugins', hidden: true },
    { label: 'Token usage', hidden: false },
  ])
})

test('collection mode mounts and folds the 0.2.x markup', () => {
  const run = runCollection({ wrapped: true, launcher: true })
  assert.ok(run.collectionRow !== null, 'the collection row must be injected')
  assert.equal(run.nav.children[0], run.collectionRow, 'and sit above the folded rows')
  for (const row of run.rows) assert.equal(row.hidden, true, `${row.label} must fold away`)
  const launcherRow = run.allRows.find((row) => row.launcher)
  assert.ok(launcherRow !== undefined, 'the launcher is still a row of the list')
  assert.equal(launcherRow.hidden, false, 'but it folds by its own attribute, not by the panel mark')
  assert.equal(
    run.nav.lastElementChild.getAttribute('data-dsh-leftpanel-more-hidden'),
    '',
    'the launcher wrapper is what gets folded',
  )
})

test('the collection row is not read back as a panel entry in either markup', () => {
  for (const wrapped of [false, true]) {
    const run = runCollection({ wrapped, rows: ['Plugins'] })
    assert.equal(run.rows.length, 1, `only the real panel row is listed (wrapped: ${wrapped})`)
    assert.equal(run.rows[0].hidden, true, `and it folds (wrapped: ${wrapped})`)
  }
})

// ── the shell's overflow ("更多") folds into the card's second layer ──────

test('the overflow launcher is folded away and restored with the mode', async () => {
  // The shell renders the launcher as a wrapper around a panel-row button whose
  // `aria-haspopup` is `menu`; that attribute is how it is told apart from a
  // panel row.
  const nav = buildSidebar(['Plugins', 'Schedules'], { launcher: true })
  const launcher = nav.lastElementChild
  const launcherButton = launcher.firstElementChild

  const run = runCollection({ rows: ['Plugins', 'Schedules'], nav })
  assert.equal(launcher.getAttribute('data-dsh-leftpanel-more-hidden'), '', 'the launcher is hidden while folding')
  assert.equal(launcherButton.hasAttribute(HIDE_ATTR), false, 'the button itself is left to React')
  // The harvest is asynchronous; let it settle so a stub failure cannot leak
  // into the next test as an unhandled rejection.
  await run.settled
})

test('turning the mode off puts the overflow launcher back', () => {
  const nav = buildSidebar(['Plugins'], { launcher: true })
  const launcher = nav.lastElementChild
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

test('the card deals rows across the two columns, not column by column', () => {
  // Overflow entries are the last rows of one list. Dealing column-major would
  // stack them in the second column, which reads as a group of their own.
  const clientSource = fs.readFileSync(CLIENT, 'utf8')
  assert.match(clientSource, /function splitColumns\(items\)[\s\S]{0,400}index % 2 === 0/, 'the deal is row-major')
  assert.doesNotMatch(clientSource, /const half = Math\.ceil\(items\.length \/ 2\)/, 'column-major dealing is gone')
})

test('the collapsed rail shows only the glyph and marks the selection', () => {
  const css = fs.readFileSync(CLIENT, 'utf8')
  // The shell shrinks each row to a 36px square when the sidebar collapses.
  // Without these rules the row's text overflows a 36px track, which is what
  // the rail looked like before this was pinned.
  assert.match(css, /\.lp-coll\[data-collapsed="true"\]\{width:36px/, 'the row becomes a square')
  assert.match(css, /\.lp-coll\[data-collapsed="true"\] \.lp-coll-label/, 'the text steps out of the way')
  assert.match(css, /data-has-selection="true"\]::after/, 'a selected entry keeps a corner mark')
})

test('the row observer stays attached while collection mode is on', () => {
  const src = fs.readFileSync(CLIENT, 'utf8')
  // Collection mode folds rows with an empty user `hidden` set; gating the
  // observer on `hidden.length` alone left it detached and the rail stale.
  assert.match(src, /hidden\.length === 0 && collection\.enabled !== true/, 'collection mode keeps the observer on')
})

test('a repaint is scheduled even when requestAnimationFrame never fires', () => {
  // `requestAnimationFrame` does not fire in a background tab or in a window the
  // compositor never paints, and a panel row can mount late there too (a plugin
  // registering after the sidebar's first paint). With rAF as the only hook the
  // pass stalls and that row stays unfolded until the tab is shown again, so the
  // timer must be armed unconditionally rather than as an `else` branch.
  const src = fs.readFileSync(CLIENT, 'utf8')
  assert.match(src, /requestAnimationFrame\(run\)/, 'the frame hook stays')
  assert.match(src, /requestAnimationFrame\(run\)\s*\n\s*window\.setTimeout\(run, 32\)/, 'the timer is armed alongside it, not instead of it')
  assert.doesNotMatch(src, /else window\.setTimeout\(run, 32\)/, 'the timer is no longer an either/or fallback')
})

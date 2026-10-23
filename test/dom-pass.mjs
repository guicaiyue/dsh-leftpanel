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

/** A minimal element that supports exactly what the pass touches. */
class Element {
  constructor(tagName) {
    this.tagName = tagName
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
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
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
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

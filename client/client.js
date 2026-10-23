/**
 * @zhujiuyi/dsh-leftpanel — browser half (DSH web client).
 *
 * Loaded as a classic script through `window.__ModuleLoader__.load()`, exactly
 * like every other client bundle. Conventions this file keeps:
 *   - `id` equals the package name, because that identity is how the loader and
 *     the Plugins page address this bundle;
 *   - only the platform-seed specifier `react` is required — no Harness client
 *     package is imported as a module;
 *   - styles are self-contained: no @import, no remote URL, and every colour
 *     comes from a `--dsw-*` token, so a theme swap degrades appearance rather
 *     than rendering.
 *
 * ── where it lives ─────────────────────────────────────────────────────────
 * One extension point: the Settings dialog's `settings.section` list, as a
 * section named "左栏菜单" / "Left menu". This plugin deliberately owns no
 * left-sidebar row of its own — a menu manager that occupies the menu it
 * manages would be one row of noise in the very list the reader came to prune.
 *
 * ── why the DOM pass exists ────────────────────────────────────────────────
 * The sidebar shell owns its row list: it renders one row per live
 * `sidebar.panellist` entry and has no "hidden" concept, and disposing another
 * plugin's registration is not this plugin's to do. What this plugin owns is a
 * presentation pass over those rows: it finds the shell's row list (the `<nav>`
 * whose children are the panel buttons), matches rows positionally against the
 * same sorted entry projection the shell itself builds (cross-checked by
 * accessible name), and marks the hidden ones with an attribute that a rule in
 * this bundle turns into `display:none`.
 *
 * That keeps other plugins' components mounted and their state intact, and it
 * self-heals: a MutationObserver re-applies the marks whenever the shell
 * re-renders (locale switch, collapse/expand, a plugin loading late). When the
 * row count disagrees with the projection, or a name does not match, the pass
 * declines to touch that row — degrading to "hides nothing" rather than
 * "hides the wrong row".
 */

window.__ModuleLoader__.load({
	id: '@zhujiuyi/dsh-leftpanel',
	factory(require) {
		'use strict'

		const React = require('react')
		const h = React.createElement

		/** Locale namespace this browser half owns. */
		const NS = 'leftPanel'
		/** Route the host half registers. */
		const STATE_PATH = '/api/left-panel/state'
		/** The list slot whose entries become sidebar rows. */
		const SLOT = 'sidebar.panellist'
		/** This settings section's id. */
		const SECTION_ID = 'left-panel'
		/** Boot mirror of the hidden set, so first paint hides rows before the host answers. */
		const MIRROR_KEY = 'dsh-leftpanel:hidden'
		/** Attribute this plugin sets on a sidebar row it is hiding. */
		const HIDE_ATTR = 'data-dsh-leftpanel-hidden'

		// ── dictionaries ────────────────────────────────────────────────────
		const zh = {
			lang: 'zh',
			nav: '左栏菜单',
			title: '左栏菜单',
			lede: '列出所有可以出现在左侧菜单里的功能，并逐个隐藏或显示。隐藏只影响左侧入口，功能本身照常可用。',
			reset: '全部显示',
			panelsTitle: '面板入口',
			panelsHint: '插件注册到左侧菜单的面板入口，可逐项开关。',
			fixedTitle: '固定控件',
			fixedHint: '侧边栏外壳自己的控件，不属于面板入口，因此只列出、不提供开关。',
			hiddenTag: '已隐藏',
			shownTag: '显示中',
			empty: '当前没有任何插件向左侧菜单注册面板入口。',
			errorLoad: '读取隐藏状态失败，改动只保存在本标签页。',
			errorSave: '保存失败，改动只保存在本标签页。',
			staleTitle: '失效记录',
			staleHint: '这些 id 曾被隐藏，但现在没有对应的面板。',
			staleClear: '清除记录',
			count: '共 {n} 项，已隐藏 {m} 项',
			fixedNewSession: '新建会话',
			fixedWorkspaces: '工作区与会话列表',
			fixedSettings: '设置',
			fixedFooter: '底部附加控件',
			fixedBrand: '品牌标记',
			helpTitle: '说明',
			helpBody: '本插件只改变左侧菜单的可见性：被隐藏的功能仍然注册在布局里，通过命令或其他入口照常可用。设置保存在本机 profile 中，重启后保留。',
		}

		const en = {
			lang: 'en',
			nav: 'Left menu',
			title: 'Left menu',
			lede: 'Every item that can appear in the left sidebar, each with its own hide/show switch. Hiding affects the entry only — the feature itself keeps working.',
			reset: 'Show all',
			panelsTitle: 'Panel entries',
			panelsHint: 'Panel entries plugins register into the left menu; each one can be toggled.',
			fixedTitle: 'Fixed controls',
			fixedHint: 'These belong to the sidebar shell rather than to panel registration, so they are listed without a switch.',
			hiddenTag: 'Hidden',
			shownTag: 'Shown',
			empty: 'No plugin currently registers a panel entry into the left menu.',
			errorLoad: 'Could not read the hidden set; changes stay in this tab only.',
			errorSave: 'Could not save; changes stay in this tab only.',
			staleTitle: 'Stale records',
			staleHint: 'These ids were hidden once but no longer match a panel.',
			staleClear: 'Clear records',
			count: '{n} items, {m} hidden',
			fixedNewSession: 'New session',
			fixedWorkspaces: 'Workspaces and session list',
			fixedSettings: 'Settings',
			fixedFooter: 'Footer actions',
			fixedBrand: 'Brand mark',
			helpTitle: 'How it works',
			helpBody: 'This plugin only changes left-menu visibility: a hidden feature stays registered in the layout and remains reachable by command or other entry points. The set lives in this machine\'s profile and survives a restart.',
		}

		// ── styles ──────────────────────────────────────────────────────────
		// The settings dialog already supplies the scroll container, the page
		// padding and the option column width, so this section owns only its own
		// content: no full-height frame, no second scrollbar.
		const CSS = [
			// The one global rule: a marked sidebar row disappears. `!important`
			// because the shell sets the row's own display.
			`[${HIDE_ATTR}]{display:none !important}`,

			'.lp-root{--lp-tint:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);--lp-tint-strong:color-mix(in srgb,var(--dsw-alias-label-primary) 13%,transparent);--lp-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;width:100%;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.6;letter-spacing:.005em}',
			'.lp-root *,.lp-root *::before,.lp-root *::after{box-sizing:border-box}',
			'.lp-root h1,.lp-root h2,.lp-root h3,.lp-root p{margin:0}',
			'.lp-root button{font:inherit;color:inherit}',
			'.lp-root :focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',

			'.lp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}',
			'.lp-h1{margin:0;font-size:16px;line-height:24px;font-weight:500}',
			'.lp-lede{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12.5px;max-width:560px}',
			'.lp-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;white-space:nowrap;flex:none;transition:border-color .15s ease,color .15s ease,background .15s ease}',
			'.lp-btn:hover:not([disabled]){background:var(--lp-tint);border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary)}',
			'.lp-btn:active:not([disabled]){background:var(--lp-tint-strong)}',
			'.lp-btn[disabled]{opacity:.5;cursor:default}',
			'.lp-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;margin-top:8px}',
			'.lp-sep{width:3px;height:3px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.75;flex:none}',
			'.lp-err{margin-top:12px;padding:9px 12px;border-radius:var(--dsw-radius-sm,8px);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12.5px}',

			'.lp-section{margin-top:22px}',
			'.lp-section-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
			'.lp-h2{margin:0;font-size:13px;font-weight:600}',
			'.lp-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}',
			'.lp-card{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',

			'.lp-row{display:flex;align-items:center;gap:12px;padding:11px 14px;min-width:0}',
			'.lp-row + .lp-row{border-top:1px solid var(--dsw-alias-border-l2)}',
			'.lp-row[data-hidden="true"] .lp-name{color:var(--dsw-alias-label-tertiary);text-decoration:line-through;text-decoration-thickness:1px}',
			'.lp-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:var(--dsw-radius-sm,8px);background:var(--lp-tint);color:var(--dsw-alias-label-secondary)}',
			'.lp-row[data-hidden="true"] .lp-glyph{color:var(--dsw-alias-label-tertiary)}',
			'.lp-main{flex:1 1 auto;min-width:0}',
			'.lp-name{display:block;font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.lp-sub{display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--lp-mono);font-size:11px}',
			'.lp-tag{flex:none;font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
			'.lp-tag[data-tone="hidden"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent);color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}',

			'.lp-switch{flex:none;position:relative;width:38px;height:22px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--lp-tint);cursor:pointer;padding:0;transition:background .15s ease,border-color .15s ease}',
			'.lp-switch:hover{border-color:var(--dsw-alias-border-l4)}',
			'.lp-switch[aria-checked="true"]{background:var(--dsw-static-deepseek-500,#4176e6);border-color:transparent}',
			'.lp-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 2px rgba(0,0,0,.22);transition:transform .15s ease}',
			'.lp-switch[aria-checked="true"] .lp-knob{transform:translateX(16px);background:#fff}',
			'@media (prefers-reduced-motion:reduce){.lp-knob,.lp-switch,.lp-btn{transition:none}}',

			'.lp-empty{padding:20px 14px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
			'.lp-note{margin-top:22px;padding:13px 14px;border-radius:var(--dsw-radius-lg,14px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12.5px}',
			'.lp-note b{display:block;margin-bottom:4px;font-size:12px;color:var(--dsw-alias-label-primary)}',
		].join('\n')

		// ── pure helpers ────────────────────────────────────────────────────
		/**
		 * Resolve a slot label the way the shell does: `resolveSlotLabel` calls a
		 * thunk, and the sidebar then falls back to the id only for `null`/
		 * `undefined`. Mirrored exactly so row order and names cannot diverge.
		 * @param {unknown} label
		 * @param {string} id
		 * @returns {string}
		 */
		function resolveLabel(label, id) {
			try {
				const value = typeof label === 'function' ? label() : label
				if (value === null || value === undefined) return id
				return typeof value === 'string' ? value : String(value)
			} catch {
				return id
			}
		}

		/**
		 * Project `sidebar.panellist` entries into the row list the shell renders.
		 *
		 * `entriesOfSlot` already collapsed duplicate ids, and the sidebar shell
		 * sorts the survivors by `order` alone — this mirrors that projection
		 * exactly, because identical ordering is what makes positional row matching
		 * safe.
		 * @param {readonly any[]} entries
		 * @returns {{ id: string, label: string }[]}
		 */
		function projectPanels(entries) {
			const seen = new Set()
			const out = []
			for (const entry of Array.isArray(entries) ? entries : []) {
				if (entry === null || typeof entry !== 'object') continue
				const id = typeof entry.options?.id === 'string' ? entry.options.id : ''
				if (id === '' || seen.has(id)) continue
				seen.add(id)
				out.push({
					id,
					order: Number(entry.options.order) || 0,
					label: resolveLabel(entry.options.label, id),
				})
			}
			out.sort((a, b) => a.order - b.order)
			return out.map((panel) => ({ id: panel.id, label: panel.label }))
		}

		/**
		 * Coerce anything into an id list. Ids are slot entry ids: short,
		 * printable, no whitespace. Anything else is dropped so a hand-edited file
		 * cannot wedge the page.
		 * @param {unknown} value
		 * @returns {string[]}
		 */
		function normalizeIds(value) {
			if (!Array.isArray(value)) return []
			const ids = new Set()
			for (const entry of value) {
				if (typeof entry !== 'string') continue
				const id = entry.trim()
				if (id === '' || id.length > 120 || /\s/.test(id)) continue
				ids.add(id)
			}
			return [...ids].sort()
		}

		/** @param {string[]} a @param {string[]} b @returns {boolean} */
		function sameIds(a, b) {
			if (a.length !== b.length) return false
			for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
			return true
		}

		// ── plugin body ─────────────────────────────────────────────────────
		return {
			/** Cordis client services this browser half needs. */
			inject: ['slots', 'locale'],
			/** @param {any} ctx */
			apply(ctx) {
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'left-panel: dictionaries')

				ctx.effect(() => {
					if (typeof document === 'undefined') return () => {}
					const style = document.createElement('style')
					style.setAttribute('data-plugin', '@zhujiuyi/dsh-leftpanel')
					style.textContent = CSS
					document.head.appendChild(style)
					return () => {
						style.remove()
					}
				}, 'left-panel: styles')

				const t = ctx.locale.bind(NS)

				/** The fixed shell seats, listed read-only on the page. */
				const FIXED = [
					{ key: 'new-session', labelKey: 'fixedNewSession', seat: 'sidebar / New Session' },
					{ key: 'workspaces', labelKey: 'fixedWorkspaces', seat: 'sidebar.workspaces' },
					{ key: 'settings', labelKey: 'fixedSettings', seat: 'sidebar.settings' },
					{ key: 'footer', labelKey: 'fixedFooter', seat: 'sidebar.footer.action' },
					{ key: 'brand', labelKey: 'fixedBrand', seat: 'sidebar.brand.mark / .name' },
				]

				// ── shared state ──────────────────────────────────────────────
				/** Hidden ids; the host file is the authority, localStorage the boot mirror. */
				let hidden = readMirror()
				/** @type {'load' | 'save' | null} */
				let error = null
				/** Live row projection; refreshed on slot and locale changes. */
				let panels = []

				/** View subscribers (the page) and the memoised snapshot. */
				const listeners = new Set()
				/** @type {{ panels: any[], hidden: string[], error: string | null } | null} */
				let snapshot = null

				const emit = () => {
					snapshot = null
					for (const listener of [...listeners]) {
						try {
							listener()
						} catch {
							// One throwing subscriber must not stop the others.
						}
					}
				}

				const view = {
					getSnapshot() {
						if (snapshot === null) {
							snapshot = {
								panels: panels.map((panel) => ({ id: panel.id, label: panel.label })),
								hidden: [...hidden],
								error,
							}
						}
						return snapshot
					},
					subscribe(listener) {
						listeners.add(listener)
						return () => {
							listeners.delete(listener)
						}
					},
				}

				/** @returns {string[]} */
				function readMirror() {
					try {
						return normalizeIds(JSON.parse(window.localStorage.getItem(MIRROR_KEY) ?? '[]'))
					} catch {
						return []
					}
				}

				/** @param {string[]} ids */
				function writeMirror(ids) {
					try {
						window.localStorage.setItem(MIRROR_KEY, JSON.stringify(ids))
					} catch {
						// Private mode or a full quota: the host file still holds the truth.
					}
				}

				/**
				 * Replace the hidden set locally. Nothing is persisted here — the
				 * caller decides whether this came from the host or needs saving.
				 * @param {unknown} next
				 * @param {'load' | 'save' | null} [nextError]
				 */
				function setHidden(next, nextError) {
					const clean = normalizeIds(next)
					const changed = !sameIds(clean, hidden)
					const errorChanged = (nextError ?? null) !== error
					if (!changed && !errorChanged) return false
					hidden = clean
					error = nextError ?? null
					writeMirror(clean)
					emit()
					return changed
				}

				// ── DOM pass ──────────────────────────────────────────────────
				/**
				 * Find the sidebar's row list: the `<nav>` that holds the panel
				 * buttons. It is identified structurally — a `nav` whose direct
				 * children are the buttons carrying `aria-current`/glyph spans — so no
				 * hashed class name, locale string or plugin-owned anchor is depended
				 * on.
				 * @returns {Element | null}
				 */
				function findRowList() {
					if (typeof document === 'undefined') return null
					/** @type {Element[]} */
					const candidates = [...document.querySelectorAll('nav')]
					for (const nav of candidates) {
						const buttons = [...nav.children].filter((node) => node.tagName === 'BUTTON')
						if (buttons.length === 0) continue
						// A panel row is a button with an accessible name; the workspaces
						// and footer seats are lists of a different shape.
						const named = buttons.filter((node) => (node.getAttribute('aria-label') ?? '') !== '')
						if (named.length === buttons.length) return nav
					}
					return null
				}

				/**
				 * Mark hidden rows and clear the mark from the rest.
				 *
				 * Positional matching is cross-checked against each row's accessible
				 * name; when the row count disagrees with the projection, only rows
				 * whose name matches a hidden panel's label are touched.
				 * @param {string[]} ids
				 * @param {{ id: string, label: string }[]} list
				 */
				function applyRowMarks(ids, list) {
					const rowList = findRowList()
					if (rowList === null) return

					const rows = [...rowList.children].filter((node) => node.tagName === 'BUTTON')
					const hiddenSet = new Set(ids)
					const positional = rows.length === list.length
					for (let index = 0; index < rows.length; index += 1) {
						const row = rows[index]
						const panel = positional ? list[index] : undefined
						let hide = false
						if (panel !== undefined) {
							hide = hiddenSet.has(panel.id)
							const name = row.getAttribute('aria-label')
							// A positional hit whose accessible name disagrees is not trusted.
							if (hide && name !== null && name !== panel.label) hide = false
						} else {
							const name = row.getAttribute('aria-label')
							hide = name !== null && list.some((item) => item.label === name && hiddenSet.has(item.id))
						}
						if (hide) row.setAttribute(HIDE_ATTR, '')
						else row.removeAttribute(HIDE_ATTR)
					}
				}

				/** Re-run the DOM pass from current state. */
				function paint() {
					try {
						applyRowMarks(hidden, panels)
					} catch {
						// A presentation pass failure must never take a page down.
					}
				}

				/** Re-read the slot ledger into `panels`; returns whether it moved. */
				function refreshPanels() {
					let entries = []
					try {
						entries = ctx.slots.entriesOfSlot(SLOT)
					} catch {
						entries = []
					}
					const next = projectPanels(entries)
					const moved = next.length !== panels.length
						|| next.some((panel, index) => panel.id !== panels[index]?.id || panel.label !== panels[index]?.label)
					panels = next
					return moved
				}

				// ── host round trips ──────────────────────────────────────────
				async function loadFromHost() {
					try {
						const response = await fetch(STATE_PATH, {
							method: 'GET',
							credentials: 'same-origin',
							cache: 'no-store',
							headers: { accept: 'application/json' },
						})
						if (!response.ok) throw new Error('HTTP ' + response.status)
						const data = await response.json()
						setHidden(data?.hidden, null)
					} catch {
						setHidden(hidden, 'load')
					}
				}

				/** @param {string[]} ids */
				async function saveToHost(ids) {
					try {
						const response = await fetch(STATE_PATH, {
							method: 'POST',
							credentials: 'same-origin',
							cache: 'no-store',
							headers: { accept: 'application/json', 'content-type': 'application/json' },
							body: JSON.stringify({ hidden: ids }),
						})
						if (!response.ok) throw new Error('HTTP ' + response.status)
						const data = await response.json()
						setHidden(data?.hidden, null)
					} catch {
						setHidden(hidden, 'save')
					}
				}

				// ── actions ───────────────────────────────────────────────────
				/** @param {string} id */
				function toggle(id) {
					const next = new Set(hidden)
					if (next.has(id)) next.delete(id)
					else next.add(id)
					setHidden([...next], null)
					void saveToHost(hidden)
				}

				function resetAll() {
					setHidden([], null)
					void saveToHost([])
				}

				function clearStale() {
					const live = new Set(panels.map((panel) => panel.id))
					const kept = hidden.filter((id) => live.has(id))
					setHidden(kept, null)
					void saveToHost(kept)
				}

				// ── page ──────────────────────────────────────────────────────
				/** @param {{ checked: boolean, label: string, onToggle: () => void }} props */
				function Switch(props) {
					return h('button', {
						type: 'button',
						role: 'switch',
						className: 'lp-switch',
						'aria-checked': props.checked ? 'true' : 'false',
						'aria-label': props.label,
						title: props.label,
						onClick: props.onToggle,
					}, h('span', { className: 'lp-knob', 'aria-hidden': 'true' }))
				}

				/** The left-menu glyph: a sidebar pane with its rows. */
				function MenuIcon(props) {
					const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 16
					return h('svg', {
						width: size,
						height: size,
						viewBox: '0 0 16 16',
						fill: 'none',
						focusable: 'false',
						'aria-hidden': 'true',
						style: { display: 'block' },
					},
					h('rect', { x: 1.6, y: 2.2, width: 12.8, height: 11.6, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.3 }),
					h('path', { d: 'M6.2 2.6v10.8', stroke: 'currentColor', strokeWidth: 1.3 }),
					h('path', { d: 'M3.5 5.4h1.3M3.5 7.9h1.3M3.5 10.4h1.3', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.75 }),
					h('path', { d: 'M8.5 5.6h3.6M8.5 8h3.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))
				}

				/**
				 * The settings section. `t` arrives through the slot's own locale
				 * seat; the live data through `useSyncExternalStore` over the plugin's
				 * shared source, so a toggle repaints instantly.
				 * @param {any} props
				 */
				function LeftPanelSection(props) {
					const tFn = typeof props?.t === 'function' ? props.t : (key) => key
					const current = React.useSyncExternalStore(view.subscribe, view.getSnapshot)

					const hiddenSet = React.useMemo(() => new Set(current.hidden), [current.hidden])
					const panelIds = React.useMemo(() => new Set(current.panels.map((panel) => panel.id)), [current.panels])
					const hiddenCount = current.panels.filter((panel) => hiddenSet.has(panel.id)).length
					const stale = current.hidden.filter((id) => !panelIds.has(id))

					const rows = current.panels.map((panel) => {
						const isHidden = hiddenSet.has(panel.id)
						return h('div', {
							key: panel.id,
							className: 'lp-row',
							'data-hidden': isHidden ? 'true' : 'false',
						},
						h('span', { className: 'lp-glyph', 'aria-hidden': 'true' }, h(MenuIcon, { size: 15 })),
						h('span', { className: 'lp-main' },
							h('span', { className: 'lp-name' }, panel.label),
							h('span', { className: 'lp-sub' }, panel.id)),
						h('span', {
							className: 'lp-tag',
							'data-tone': isHidden ? 'hidden' : 'shown',
						}, isHidden ? tFn('hiddenTag') : tFn('shownTag')),
						h(Switch, {
							checked: !isHidden,
							label: panel.label + ' — ' + (isHidden ? tFn('show') : tFn('hide')),
							onToggle: () => toggle(panel.id),
						}))
					})

					return h('div', { className: 'lp-root' },
						h('div', { className: 'lp-head' },
							h('div', { style: { minWidth: 0 } },
								h('h1', { className: 'lp-h1' }, tFn('title')),
								h('p', { className: 'lp-lede' }, tFn('lede')),
								h('div', { className: 'lp-meta' },
									h('span', null, tFn('count', { n: current.panels.length, m: hiddenCount })),
									stale.length > 0
										? h('span', { className: 'lp-sep', 'aria-hidden': 'true' })
										: null,
									stale.length > 0
										? h('span', null, tFn('staleTitle') + ': ' + String(stale.length))
										: null)),
							h('button', {
								type: 'button',
								className: 'lp-btn',
								disabled: hiddenCount === 0 && stale.length === 0,
								onClick: resetAll,
							}, tFn('reset'))),

						current.error === null
							? null
							: h('div', { className: 'lp-err' },
								current.error === 'save' ? tFn('errorSave') : tFn('errorLoad')),

						h('section', { className: 'lp-section', 'data-section': 'panels' },
							h('div', { className: 'lp-section-head' },
								h('h2', { className: 'lp-h2' }, tFn('panelsTitle')),
								h('span', { className: 'lp-hint' }, tFn('panelsHint'))),
							h('div', { className: 'lp-card' },
								rows.length === 0 ? h('div', { className: 'lp-empty' }, tFn('empty')) : rows)),

						stale.length > 0
							? h('section', { className: 'lp-section', 'data-section': 'stale' },
								h('div', { className: 'lp-section-head' },
									h('h2', { className: 'lp-h2' }, tFn('staleTitle')),
									h('span', { className: 'lp-hint' }, tFn('staleHint')),
									h('button', {
										type: 'button',
										className: 'lp-btn',
										onClick: clearStale,
									}, tFn('staleClear'))),
								h('div', { className: 'lp-card' },
									stale.map((id) => h('div', {
										key: id,
										className: 'lp-row',
										'data-hidden': 'true',
									},
									h('span', { className: 'lp-glyph', 'aria-hidden': 'true' }, h(MenuIcon, { size: 15 })),
									h('span', { className: 'lp-main' },
										h('span', { className: 'lp-name' }, id),
										h('span', { className: 'lp-sub' }, id))))))
							: null,

						h('section', { className: 'lp-section', 'data-section': 'fixed' },
							h('div', { className: 'lp-section-head' },
								h('h2', { className: 'lp-h2' }, tFn('fixedTitle')),
								h('span', { className: 'lp-hint' }, tFn('fixedHint'))),
							h('div', { className: 'lp-card' },
								FIXED.map((item) => h('div', { key: item.key, className: 'lp-row' },
									h('span', { className: 'lp-glyph', 'aria-hidden': 'true' }, h(MenuIcon, { size: 15 })),
									h('span', { className: 'lp-main' },
										h('span', { className: 'lp-name' }, tFn(item.labelKey)),
										h('span', { className: 'lp-sub' }, item.seat)),
									h('span', { className: 'lp-tag' }, tFn('shownTag')))))),

						h('div', { className: 'lp-note' },
							h('b', null, tFn('helpTitle')),
							h('span', null, tFn('helpBody'))))
				}

				// ── registration ──────────────────────────────────────────────
				// `locale: NS` makes the slot kit hand this component its own `t`, so
				// the page follows the active locale without an extra inject face (and
				// declaring one would collide with that prop).
				ctx.slots.inject('settings.section', () => ctx.slots.register({
					name: 'settings.section',
					id: SECTION_ID,
					order: 18,
					label: () => t('nav'),
					locale: NS,
				}, LeftPanelSection))

				// ── wiring ────────────────────────────────────────────────────
				// The row ledger and the locale both move rows; re-project and repaint.
				ctx.effect(() => ctx.slots.subscribe(SLOT, () => {
					refreshPanels()
					emit()
					paint()
				}), 'left-panel: panel entries')

				ctx.effect(() => ctx.locale.subscribe(() => {
					refreshPanels()
					emit()
					paint()
				}), 'left-panel: panel labels')

				// Every hidden-set change repaints the sidebar immediately.
				ctx.effect(() => view.subscribe(paint), 'left-panel: hidden set')

				// The shell re-renders its rows on collapse/expand, locale switch and
				// late plugin loads. Watch the body while anything is hidden and
				// re-apply the marks; stay detached when nothing is.
				ctx.effect(() => {
					if (typeof document === 'undefined' || typeof MutationObserver !== 'function') {
						return () => {}
					}
					/** @type {MutationObserver | null} */
					let observer = null
					let queued = false
					const schedule = () => {
						if (queued) return
						queued = true
						const run = () => {
							queued = false
							refreshPanels()
							paint()
						}
						if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run)
						else window.setTimeout(run, 32)
					}
					const ensure = () => {
						if (hidden.length === 0) {
							if (observer !== null) {
								observer.disconnect()
								observer = null
							}
							return
						}
						if (observer !== null) return
						observer = new MutationObserver(schedule)
						observer.observe(document.body, { childList: true, subtree: true })
					}
					const off = view.subscribe(ensure)
					ensure()
					schedule()
					return () => {
						off()
						if (observer !== null) observer.disconnect()
					}
				}, 'left-panel: row marks')

				// Reconcile with the host, then paint from the authority.
				ctx.effect(() => {
					let alive = true
					refreshPanels()
					emit()
					paint()
					loadFromHost().then(() => {
						if (!alive) return
						refreshPanels()
						emit()
						paint()
					})
					return () => {
						alive = false
					}
				}, 'left-panel: host state')
			},
		}
	},
})

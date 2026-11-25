/**
 * dsh-leftpanel — browser half (DSH web client).
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
	id: '@xirizhi/dsh-leftpanel',
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
		/** Attribute marking the synthetic "集合" row this plugin injects. */
		const COLLECTION_ATTR = 'data-dsh-leftpanel-collection'
		/** Attribute marking the floating card that row opens. */
		const CARD_ATTR = 'data-dsh-leftpanel-card'
		/** Attribute marking the shell's own "更多" launcher while it is folded away. */
		const MORE_HIDE_ATTR = 'data-dsh-leftpanel-more-hidden'
		/** Attribute marking the nested card that the card's "更多" item opens. */
		const SUB_ATTR = 'data-dsh-leftpanel-subcard'
		/** Boot mirror of the collection setting, next to the hidden-set mirror. */
		const COLLECTION_MIRROR_KEY = 'dsh-leftpanel:collection'
		/** Card geometry, measured against the live sidebar (see docs/proto). */
		const CARD_WIDTH = 448
		/** Milliseconds the card lingers after the pointer leaves row and card. */
		const CARD_CLOSE_DELAY = 160
		/** Gap between the sidebar's right edge and the card's left edge. */
		const CARD_GAP = 8

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
			collectionTitle: '集合',
			collectionHint: '把面板入口收进一行；悬浮展开双列卡片，点击直达所选页面。默认开启。',
			collectionName: '集合模式',
			collectionSub: '左栏只留一行「集合」，面板入口收进右侧双列卡片',
			collectionOn: '已开启',
			collectionOff: '已关闭',
			collectionNav: '集合',
			collectionKeysMove: '↑↓ 选择 · ←→ 换列',
			collectionKeysOpen: 'Enter 打开 · Esc 关闭',
			collectionEmpty: '没有可收进集合的面板入口。',
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
			collectionTitle: 'Collection',
			collectionHint: 'Fold the panel entries into one row; hovering opens a two-column card, clicking goes straight to the selected panel. On by default.',
			collectionName: 'Collection mode',
			collectionSub: 'Keep one "Collection" row in the sidebar and move every panel entry into the card beside it',
			collectionOn: 'On',
			collectionOff: 'Off',
			collectionNav: 'Collection',
			collectionKeysMove: '↑↓ select · ←→ column',
			collectionKeysOpen: 'Enter open · Esc close',
			collectionEmpty: 'No panel entry is available to collect.',
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

			// ── collection row + card (styles for the injected sidebar DOM) ──
			`[${COLLECTION_ATTR}]{position:relative}`,
			// The shell's own overflow launcher folds into the card as its second
			// layer; it is a <span> wrapper, so the hide rule targets the wrapper.
			`[${MORE_HIDE_ATTR}]{display:none !important}`,
			// Reading the real overflow menu means opening it; this keeps that
			// read invisible instead of flashing a menu anchored to a hidden row.
			'html[data-dsh-leftpanel-harvest] [role="menu"]{opacity:0 !important;pointer-events:none !important}',
			// Metrics copied from the shell's own row (`.panelRow` + the 3px
			// `--dsh-sidebar-paint-inset` border its wrapper paints), so the injected
			// row lines up with its neighbours in both markups: the row box is the
			// wrapper in 0.2.x and the button in 0.1.x, and only the button is ours.
			'.lp-coll{display:flex;align-items:center;gap:6px;box-sizing:border-box;width:100%;min-height:32px;padding:5px 9px;border:0;border-inline:3px solid transparent;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer;transition:background-color .15s ease}',
			'.lp-coll:hover,.lp-coll[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover)}',
			'.lp-coll:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary);outline-offset:-2px}',
			'.lp-coll-glyph{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px}',
			// Collapsed rail: the shell gives each row a 36px square, so the row
			// keeps only its glyph and every text part steps out of the way.
			'.lp-coll[data-collapsed="true"]{width:36px;justify-content:center;padding:0;gap:0;border-inline:0}',
			'.lp-coll[data-collapsed="true"] .lp-coll-label,'
			+ '.lp-coll[data-collapsed="true"] .lp-coll-badge,'
			+ '.lp-coll[data-collapsed="true"] .lp-coll-slash,'
			+ '.lp-coll[data-collapsed="true"] .lp-coll-item,'
			+ '.lp-coll[data-collapsed="true"] .lp-coll-chev{display:none}',
			// The selected entry keeps a presence in the rail as a corner mark.
			'.lp-coll[data-collapsed="true"]{position:relative}',
			'.lp-coll[data-collapsed="true"][data-has-selection="true"]::after{content:"";position:absolute;right:4px;bottom:5px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}',
			'.lp-coll-label{flex:0 0 auto;white-space:nowrap}',
			'.lp-coll-badge{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:16px;padding:0 4px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
			'.lp-coll-slash{flex:0 0 auto;color:var(--dsw-alias-label-tertiary);margin:0 0}',
			'.lp-coll-item{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-primary)}',
			'.lp-coll-item[hidden],.lp-coll-slash[hidden]{display:none}',
			'.lp-coll-item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.lp-coll-chev{flex:0 0 auto;margin-left:auto;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;transition:color .15s ease}',
			'.lp-coll:hover .lp-coll-chev,.lp-coll[aria-expanded="true"] .lp-coll-chev{color:var(--dsw-alias-label-secondary)}',

			'.lp-fly{position:fixed;z-index:2147483000;box-sizing:border-box;padding:6px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-2);border:var(--dsh-hairline-width,.5px) solid var(--dsw-alias-border-l2);box-shadow:0 3px 8px rgba(0,0,0,.04),0 0 20px rgba(0,0,0,.05);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px}',
			'.lp-fly[hidden]{display:none}',
			'.lp-fly-cols{display:grid;grid-template-columns:1fr 1fr;position:relative}',
			'.lp-fly-cols::before{content:"";position:absolute;left:50%;top:8px;bottom:8px;width:1px;background:var(--dsw-alias-border-l2);transform:translateX(-.5px)}',
			'.lp-fly-col{display:flex;flex-direction:column;gap:2px;min-width:0;padding:0 2px}',
			'.lp-fly-item{position:relative;display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 9px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer;transition:background-color .14s ease,color .14s ease}',
			'.lp-fly-item:hover,.lp-fly-item[data-focus="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.lp-fly-item:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary);outline-offset:-2px}',
			'.lp-fly-item-glyph{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}',
			'.lp-fly-item-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.lp-fly-item[data-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}',
			'.lp-fly-item[data-selected="true"] .lp-fly-item-glyph{color:var(--dsw-alias-state-business-primary)}',
			'.lp-fly-item[data-selected="true"]::before{content:"";position:absolute;left:0;top:50%;width:2px;height:16px;border-radius:2px;transform:translateY(-50%);background:var(--dsw-alias-state-business-primary)}',
			'.lp-fly-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding:7px 10px 3px;border-top:var(--dsh-hairline-width,.5px) solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px}',
			'.lp-fly-foot kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;padding:0 4px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-secondary)}',
			'@media (prefers-reduced-motion:reduce){.lp-coll,.lp-coll-chev,.lp-fly-item{transition:none}}',

			'.lp-empty{padding:20px 14px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
			'.lp-note{margin-top:22px;padding:13px 14px;border-radius:var(--dsw-radius-lg,14px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12.5px}',
			'.lp-note b{display:block;margin-bottom:4px;font-size:12px;color:var(--dsw-alias-label-primary)}',
		].join('\n')

		// ── pure helpers ────────────────────────────────────────────────────
		/**
		 * Coerce anything into the collection setting. Mirrors the host half so
		 * the boot mirror and a hand-edited `localStorage` entry cannot put the
		 * page in a state the host would never write.
		 * @param {unknown} value
		 * @returns {{ enabled: boolean, selectedId: string | null }}
		 */
		function normalizeCollection(value) {
			const source = value !== null && typeof value === 'object' ? value : {}
			const enabled = source.enabled === undefined ? true : source.enabled === true
			const raw = typeof source.selectedId === 'string' ? source.selectedId.trim() : ''
			const selectedId = raw === '' || raw.length > 120 || /\s/.test(raw) ? null : raw
			return { enabled, selectedId }
		}

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
					style.setAttribute('data-plugin', 'dsh-leftpanel')
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
				/** Collection setting; same authority chain as `hidden`. */
				let collection = readCollectionMirror()
				/** @type {'load' | 'save' | null} */
				let error = null
				/** Live row projection; refreshed on slot and locale changes. */
				let panels = []

				/** View subscribers (the page) and the memoised snapshot. */
				const listeners = new Set()
				/** @type {{ panels: any[], hidden: string[], collection: { enabled: boolean, selectedId: string | null }, error: string | null } | null} */
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
								collection: { enabled: collection.enabled, selectedId: collection.selectedId },
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

				/** @returns {{ enabled: boolean, selectedId: string | null }} */
				function readCollectionMirror() {
					try {
						return normalizeCollection(JSON.parse(window.localStorage.getItem(COLLECTION_MIRROR_KEY) ?? 'null'))
					} catch {
						return normalizeCollection(null)
					}
				}

				/** @param {{ enabled: boolean, selectedId: string | null }} value */
				function writeCollectionMirror(value) {
					try {
						window.localStorage.setItem(COLLECTION_MIRROR_KEY, JSON.stringify(value))
					} catch {
						// Same as the hidden mirror: the host file still holds the truth.
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

				/**
				 * Replace the collection setting locally. Like `setHidden`, this only
				 * touches local state; the caller persists.
				 * @param {unknown} next
				 * @returns {boolean} whether anything moved
				 */
				function setCollection(next) {
					const clean = normalizeCollection(next)
					if (clean.enabled === collection.enabled && clean.selectedId === collection.selectedId) return false
					collection = clean
					writeCollectionMirror(clean)
					emit()
					return true
				}

				// ── DOM pass ──────────────────────────────────────────────────
				/**
				 * The shell's panel rows, in DOM order.
				 *
				 * The row *button* is the only element that carries the accessible
				 * name, so that is what gets matched against the projection. The
				 * element that must carry the hide mark is the outermost box the
				 * shell lays out for the row, and that box moved between DSH
				 * versions:
				 *
				 *   - 0.2.x wraps the row —
				 *     `<div class="…panelEntry"><button class="…panelRow"
				 *     aria-label="…">glyph + title</button><button class="…panelUnpin"
				 *     aria-label="…">…</button></div>`. Hiding the inner button would
				 *     leave the wrapper's box and the unpin button on screen, so the
				 *     wrapper is the row.
				 *   - 0.1.x rendered the row button directly under the `<nav>`; there
				 *     the button is its own row.
				 *
				 * Both shapes are read here so the pass keeps working across an
				 * upgrade. The shell's overflow launcher ("更多") has the same wrapper
				 * shape and is named too, so it is listed as well and flagged:
				 * callers that project *panel* entries skip it.
				 * @param {any} rowList
				 * @returns {{ el: any, button: any, launcher: boolean, name: string }[]}
				 */
				function rowEntries(rowList) {
					/** @type {{ el: any, button: any, launcher: boolean, name: string }[]} */
					const entries = []
					for (const node of [...rowList.children]) {
						if (node === null || node === undefined || typeof node.tagName !== 'string') continue
						const button = node.tagName === 'BUTTON' ? node : (node.firstElementChild ?? null)
						if (button === null || button === undefined || button.tagName !== 'BUTTON') continue
						// Our own injected row is row-shaped too; it must never be read
						// back as a panel entry, or it would list itself in the card.
						if (button.getAttribute(COLLECTION_ATTR) !== null) continue
						entries.push({
							el: node,
							button,
							// The overflow launcher opens a menu; a panel row never does.
							launcher: button.getAttribute('aria-haspopup') === 'menu',
							name: button.getAttribute('aria-label') ?? '',
						})
					}
					return entries
				}

				/**
				 * Find the sidebar's row list: the `<nav>` that holds the panel rows.
				 * It is identified structurally — a `nav` whose direct children are
				 * rows, every one of them carrying an accessible name — so no hashed
				 * class name, locale string or plugin-owned anchor is depended on.
				 * @returns {Element | null}
				 */
				function findRowList() {
					if (typeof document === 'undefined') return null
					for (const nav of [...document.querySelectorAll('nav')]) {
						const entries = rowEntries(nav)
						if (entries.length === 0) continue
						// A panel row is a row with an accessible name; the workspaces
						// and footer seats are lists of a different shape.
						if (entries.every((entry) => entry.name !== '')) return nav
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

					// The launcher is a row of the list but not a panel entry: it must
					// neither shift the positional match nor be hidden by it.
					const entries = rowEntries(rowList).filter((entry) => !entry.launcher)
					const hiddenSet = new Set(ids)
					const positional = entries.length === list.length
					for (let index = 0; index < entries.length; index += 1) {
						const { el, name } = entries[index]
						const panel = positional ? list[index] : undefined
						let hide = false
						if (panel !== undefined) {
							hide = hiddenSet.has(panel.id)
							// A positional hit whose accessible name disagrees is not trusted.
							if (hide && name !== '' && name !== panel.label) hide = false
						} else {
							hide = name !== '' && list.some((item) => item.label === name && hiddenSet.has(item.id))
						}
						if (hide) el.setAttribute(HIDE_ATTR, '')
						else el.removeAttribute(HIDE_ATTR)
					}
				}

				// ── collection row + card ─────────────────────────────────────
				/** Signature of the row list the injected row/card were built for. */
				let collectionSignature = ''
				/** The injected row button, if present. */
				/** @type {any} */
				let collectionRow = null
				/** The floating card, if present. */
				/** @type {any} */
				let collectionCard = null
				/** Pending "close because the pointer left" timer. */
				let closeTimer = 0
				/** Document-level "click outside closes the card" listener. */
				/** @type {any} */
				let outsideListener = null
				/** Entries harvested from the shell's own overflow menu. */
				let moreEntries = []
				/** True once the harvest has succeeded at least once. */
				let moreHarvested = false
				/**
				 * Set when the card was closed on purpose (Escape, a pick, a click
				 * outside). Focus returning to the row must not re-open it in that
				 * case, or Escape would be a no-op: closing moves focus to the row,
				 * and a focus-driven open would immediately undo it.
				 */
				let suppressFocusOpen = false
				/** Position of the keyboard highlight in the card's ring. */
				let cardFocus = { ring: 0 }

				/** Collect the live panel rows and the glyph each one paints. */
				function readRowModel() {
					const rowList = findRowList()
					if (rowList === null) return null
					// `rowEntries` already excluded the injected collection row; the
					// shell's overflow launcher is a row of the list but not a panel.
					const entries = rowEntries(rowList).filter((entry) => !entry.launcher)
					const byLabel = new Map(panels.map((panel) => [panel.label, panel.id]))
					const items = entries.map(({ el, button, name }) => {
						const glyph = button.firstElementChild
						return {
							id: byLabel.get(name) ?? name,
							label: name,
							glyph: glyph === null || glyph === undefined ? null : glyph.innerHTML,
							hidden: el.getAttribute(HIDE_ATTR) !== null,
						}
					})
					return { rowList, rows: entries.map((entry) => entry.button), items }
				}

				/** Resolve the entry the row's slash should show. */
				function selectedPanel() {
					if (collection.selectedId === null) return null
					return panels.find((panel) => panel.id === collection.selectedId) ?? null
				}

				/** Build (once) the synthetic row button. */
				function buildRow() {
					const row = document.createElement('button')
					row.type = 'button'
					row.className = 'lp-coll'
					row.setAttribute(COLLECTION_ATTR, '')
					row.setAttribute('aria-haspopup', 'dialog')
					row.setAttribute('aria-expanded', 'false')
					// Named from the first paint: `findRowList` identifies the row
					// list as "the <nav> whose buttons all carry an accessible name",
					// so an anonymous row would make the pass lose its own anchor and
					// tear the row down again on the next frame.
					row.setAttribute('aria-label', t('collectionNav'))

					const glyph = document.createElement('span')
					glyph.className = 'lp-coll-glyph'
					glyph.setAttribute('aria-hidden', 'true')
					glyph.innerHTML = collectionGlyph()

					const label = document.createElement('span')
					label.className = 'lp-coll-label'

					const badge = document.createElement('span')
					badge.className = 'lp-coll-badge'
					badge.setAttribute('aria-hidden', 'true')

					const slash = document.createElement('span')
					slash.className = 'lp-coll-slash'
					slash.setAttribute('aria-hidden', 'true')
					slash.textContent = '/'

					const item = document.createElement('span')
					item.className = 'lp-coll-item'
					const itemGlyph = document.createElement('span')
					itemGlyph.className = 'lp-coll-glyph'
					itemGlyph.setAttribute('aria-hidden', 'true')
					const itemName = document.createElement('span')
					itemName.className = 'lp-coll-item-name'
					item.append(itemGlyph, itemName)

					const chev = document.createElement('span')
					chev.className = 'lp-coll-chev'
					chev.setAttribute('aria-hidden', 'true')
					chev.innerHTML = chevronGlyph()

					row.append(glyph, label, badge, slash, item, chev)
					return row
				}

				/**
				 * The shell's own overflow launcher ("更多").
				 *
				 * It is a wrapper element holding a panel-row button whose
				 * `aria-haspopup` is `menu`; the wrapper is what gets hidden, because
				 * the button inside is what React owns.
				 * @returns {{ wrapper: any, button: any } | null}
				 */
				function findMoreLauncher() {
					const rowList = findRowList()
					if (rowList === null) return null
					const launcher = rowEntries(rowList).find((entry) => entry.launcher)
					if (launcher === undefined) return null
					return { wrapper: launcher.el, button: launcher.button }
				}

				/** Wait one paint, so a menu React just opened is in the DOM. */
				function nextPaint() {
					return new Promise((resolve) => {
						if (typeof window.requestAnimationFrame === 'function') {
							window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
						} else {
							window.setTimeout(resolve, 32)
						}
					})
				}

				/**
				 * Read the entries of the shell's overflow menu.
				 *
				 * The menu's contents come from the `sidebar.panellist.actions` slot,
				 * which is another plugin's React tree — there is no API to enumerate
				 * it, so the only truthful source is the menu itself: open it, read
				 * the rendered rows, close it again. The `harvest` attribute blanks
				 * the menu while that happens so nothing flashes on screen.
				 * @returns {Promise<boolean>}
				 */
				async function harvestMoreEntries() {
					const launcher = findMoreLauncher()
					const root = typeof document === 'undefined' ? null : document.documentElement
					if (launcher === null || root === null || root === undefined) return false
					root.setAttribute('data-dsh-leftpanel-harvest', '')
					try {
						launcher.button.click()
						await nextPaint()
						const rows = [...document.querySelectorAll('[role="menuitem"]')]
						if (rows.length === 0) return false
						moreEntries = rows.map((row) => {
							const glyphHost = row.querySelector('span')
							return {
								label: (row.getAttribute('aria-label') ?? row.textContent ?? '').trim(),
								glyph: glyphHost === null ? '' : glyphHost.innerHTML,
							}
						}).filter((entry) => entry.label !== '')
						moreHarvested = moreEntries.length > 0
						return moreHarvested
					} catch {
						// Reading another plugin's menu is best-effort: any failure
						// means "no second layer", never a broken sidebar.
						return false
					} finally {
						// Close whatever opened, then stop hiding menus.
						try {
							document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
							document.body?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
						} catch {
							// A stub document without events still has to finish cleanly.
						}
						root.removeAttribute('data-dsh-leftpanel-harvest')
					}
				}

				/** Activate a harvested entry by opening the real menu and clicking it. */
				async function activateMoreEntry(label) {
					const launcher = findMoreLauncher()
					if (launcher === null) return
					launcher.button.click()
					await nextPaint()
					const rows = [...document.querySelectorAll('[role="menuitem"]')]
					const row = rows.find((candidate) => ((candidate.getAttribute('aria-label') ?? candidate.textContent ?? '').trim() === label))
					if (row !== undefined) row.click()
					else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
				}

				/** Build (once) the floating card. */
				function buildCard() {
					const card = document.createElement('div')
					card.className = 'lp-fly'
					card.setAttribute(CARD_ATTR, '')
					card.setAttribute('role', 'dialog')
					card.hidden = true

					const cols = document.createElement('div')
					cols.className = 'lp-fly-cols'
					const left = document.createElement('div')
					left.className = 'lp-fly-col'
					left.setAttribute('data-column', '0')
					const right = document.createElement('div')
					right.className = 'lp-fly-col'
					right.setAttribute('data-column', '1')
					cols.append(left, right)

					const foot = document.createElement('div')
					foot.className = 'lp-fly-foot'
					const hintMove = document.createElement('span')
					hintMove.setAttribute('data-role', 'hint-move')
					const hintOpen = document.createElement('span')
					hintOpen.setAttribute('data-role', 'hint-open')
					foot.append(hintMove, hintOpen)

					card.append(cols, foot)
					return card
				}

				/** The collection glyph: three stacked bars folding into one. */
				function collectionGlyph() {
					return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">'
						+ '<rect x="1.8" y="2.2" width="12.4" height="3.2" rx="1.3" stroke="currentColor" stroke-width="1.3"/>'
						+ '<rect x="1.8" y="6.6" width="12.4" height="3.2" rx="1.3" stroke="currentColor" stroke-width="1.3" opacity=".62"/>'
						+ '<rect x="1.8" y="11" width="12.4" height="3.2" rx="1.3" stroke="currentColor" stroke-width="1.3" opacity=".34"/>'
						+ '</svg>'
				}

				/**
				 * The glyph on the row's right edge.
				 *
				 * Not a chevron: a down/right chevron reads as "expands downward",
				 * which is the wrong promise for a card that opens sideways. This is
				 * the "open beside" mark — a panel outline with an arrow leaving its
				 * right edge — which is what actually happens.
				 */
				function chevronGlyph() {
					return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">'
						+ '<rect x="1.9" y="3.4" width="8.2" height="9.2" rx="1.7" stroke="currentColor" stroke-width="1.3"/>'
						+ '<path d="M8.6 8h5.2M11.2 5.4 13.8 8l-2.6 2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
						+ '</svg>'
				}

				/**
				 * Deal the rows into the card's two columns, row by row.
				 *
				 * Row-major, not column-major: the overflow entries are simply the
				 * last rows of one list, so they must fill the free cells beside the
				 * panel rows rather than stack under each other in the second column
				 * (which reads as a group of their own, i.e. exactly the special
				 * casing this card is supposed to avoid).
				 */
				function splitColumns(items) {
					const left = []
					const right = []
					for (let index = 0; index < items.length; index += 1) {
						if (index % 2 === 0) left.push(items[index])
						else right.push(items[index])
					}
					return [left, right]
				}

				/** Repaint the card's contents for the current entries. */
				function fillCard(items) {
					if (collectionCard === null) return
					const tFn = t
					// One list, one layout: the shell's overflow entries are just more
					// rows at the end of the same two columns — no divider, no group of
					// their own, no special treatment. `kind` only decides what a click
					// does, never how the row looks.
					const rows = [
						...items.map((item) => ({ kind: 'panel', id: item.id, label: item.label, glyph: item.glyph })),
						...moreEntries.map((entry) => ({ kind: 'more', id: null, label: entry.label, glyph: entry.glyph })),
					]
					const [left, right] = splitColumns(rows)
					const columns = [left, right]
					const cols = collectionCard.firstElementChild
					for (let column = 0; column < 2; column += 1) {
						const host = cols.children[column]
						host.textContent = ''
						for (const row of columns[column]) {
							const button = document.createElement('button')
							button.type = 'button'
							button.className = 'lp-fly-item'
							button.setAttribute('data-column', String(column))
							if (row.kind === 'more') {
								button.setAttribute('data-more-label', row.label)
							} else {
								button.setAttribute('data-id', row.id)
								if (row.id === collection.selectedId) button.setAttribute('data-selected', 'true')
								button.setAttribute('aria-current', row.id === collection.selectedId ? 'true' : 'false')
							}
							const glyph = document.createElement('span')
							glyph.className = 'lp-fly-item-glyph'
							glyph.setAttribute('aria-hidden', 'true')
							glyph.innerHTML = row.glyph ?? ''
							const name = document.createElement('span')
							name.className = 'lp-fly-item-name'
							name.textContent = row.label
							button.append(glyph, name)
							host.append(button)
						}
					}
					const foot = collectionCard.lastElementChild
					const move = foot.querySelector('[data-role="hint-move"]')
					const open = foot.querySelector('[data-role="hint-open"]')
					if (move !== null) move.textContent = tFn('collectionKeysMove')
					if (open !== null) open.innerHTML = ''
					if (open !== null) {
						const parts = tFn('collectionKeysOpen').split(' · ')
						for (const part of parts) {
							const kbd = document.createElement('kbd')
							kbd.textContent = part.split(' ')[0]
							const rest = document.createElement('span')
							rest.textContent = ' ' + part.split(' ').slice(1).join(' ') + ' '
							open.append(kbd, rest)
						}
					}
				}

				/** Paint the row's text for the current selection. */
				function fillRow(items) {
					if (collectionRow === null) return
					const label = collectionRow.querySelector('.lp-coll-label')
					const badge = collectionRow.querySelector('.lp-coll-badge')
					const slash = collectionRow.querySelector('.lp-coll-slash')
					const item = collectionRow.querySelector('.lp-coll-item')
					const itemGlyph = item === null ? null : item.querySelector('.lp-coll-glyph')
					const itemName = item === null ? null : item.querySelector('.lp-coll-item-name')
					if (label !== null) label.textContent = t('collectionNav')
					if (badge !== null) badge.textContent = String(items.length)
					const selected = selectedPanel()
					const source = selected === null ? null : items.find((entry) => entry.id === selected.id)
					const show = selected !== null
					if (slash !== null) slash.hidden = !show
					if (item !== null) item.hidden = !show
					if (show) {
						if (itemGlyph !== null) itemGlyph.innerHTML = source?.glyph ?? ''
						if (itemName !== null) itemName.textContent = selected.label
					}
					collectionRow.setAttribute(
						'aria-label',
						show ? t('collectionNav') + ' / ' + selected.label : t('collectionNav'),
					)
				}

				/** Position the card against the row, clamped into the viewport. */
				function placeCard() {
					if (collectionCard === null || collectionRow === null) return
					const rowRect = collectionRow.getBoundingClientRect()
					const height = collectionCard.offsetHeight
					const maxTop = window.innerHeight - height - 8
					const top = Math.max(8, Math.min(rowRect.top, maxTop))
					const left = Math.min(rowRect.right + CARD_GAP, window.innerWidth - CARD_WIDTH - 8)
					collectionCard.style.left = Math.max(8, left) + 'px'
					collectionCard.style.top = top + 'px'
					collectionCard.style.width = CARD_WIDTH + 'px'
				}

				/** @param {boolean} open */
				function setCardOpen(open) {
					if (collectionRow === null || collectionCard === null) return
					if (open && collection.enabled !== true) return
					collectionRow.setAttribute('aria-expanded', open ? 'true' : 'false')
					collectionCard.hidden = !open
					if (open) {
						placeCard()
						const first = collectionCard.querySelector('.lp-fly-item')
						if (first !== null) {
							cardFocus = { ring: 0 }
							markFocus()
						}
					}
				}

				/** Apply the keyboard highlight to the card items. */
				/**
				 * The card's rows in visual reading order: row by row, left then right.
				 * It has to match `splitColumns`, or the arrow keys would jump around
				 * the card instead of walking it.
				 */
				function cardRing() {
					if (collectionCard === null) return []
					const left = [...collectionCard.querySelectorAll('.lp-fly-item[data-column="0"]')]
					const right = [...collectionCard.querySelectorAll('.lp-fly-item[data-column="1"]')]
					const ring = []
					for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
						if (left[index] !== undefined) ring.push(left[index])
						if (right[index] !== undefined) ring.push(right[index])
					}
					return ring
				}

				function markFocus() {
					if (collectionCard === null) return
					const ring = cardRing()
					const target = ring[cardFocus.ring]
					for (const item of collectionCard.querySelectorAll('.lp-fly-item')) {
						if (item === target) item.setAttribute('data-focus', 'true')
						else item.removeAttribute('data-focus')
					}
				}

				/** Choose a panel: persist the selection, then open it for real. */
				/** @param {string} id */
				function chooseEntry(id) {
					const next = { enabled: true, selectedId: id }
					setCollection(next)
					void saveToHost({ collection: next })
					suppressFocusOpen = true
					setCardOpen(false)
					// Open the panel exactly the way its own row would: ask the
					// layout service, and fall back to a click on the real row when
					// the service is not reachable from here.
					let opened = false
					try {
						ctx.layout.selectPanel(id)
						opened = true
					} catch {
						opened = false
					}
					if (!opened) {
						const model = readRowModel()
						const row = model?.rows.find((candidate) => candidate.getAttribute('aria-label') === id
							|| (panels.find((panel) => panel.id === id)?.label ?? '') === candidate.getAttribute('aria-label'))
						row?.click()
					}
				}

				/** Wire the row and the card once. */
				function wireCollection() {
					if (collectionRow === null || collectionCard === null) return
					const open = () => {
						if (closeTimer !== 0) {
							window.clearTimeout(closeTimer)
							closeTimer = 0
						}
						setCardOpen(true)
					}
					const openFromPointer = () => {
						suppressFocusOpen = false
						open()
					}
					const closeNow = () => {
						suppressFocusOpen = true
						if (closeTimer !== 0) {
							window.clearTimeout(closeTimer)
							closeTimer = 0
						}
						setCardOpen(false)
					}
					const scheduleClose = () => {
						if (closeTimer !== 0) window.clearTimeout(closeTimer)
						closeTimer = window.setTimeout(() => {
							closeTimer = 0
							setCardOpen(false)
						}, CARD_CLOSE_DELAY)
					}
					collectionRow.addEventListener('pointerenter', openFromPointer)
					collectionRow.addEventListener('pointerleave', scheduleClose)
					collectionRow.addEventListener('focus', () => {
						if (suppressFocusOpen) return
						open()
					})
					collectionCard.addEventListener('pointerenter', openFromPointer)
					collectionCard.addEventListener('pointerleave', scheduleClose)
					collectionRow.addEventListener('click', () => {
						const selected = selectedPanel()
						// First use never navigates: with nothing selected the row only
						// reveals the card, which is the whole point of the mode.
						if (selected === null) {
							setCardOpen(true)
							return
						}
						chooseEntry(selected.id)
					})
					collectionRow.addEventListener('keydown', (event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
							event.preventDefault()
							open()
							const first = collectionCard.querySelector('.lp-fly-item')
							if (first !== null) first.focus()
						}
					})
					// One document-level listener per mount; `unmountCollection`
					// removes it, so toggling the mode on and off cannot pile them up.
					outsideListener = (event) => {
						if (collectionCard === null || collectionCard.hidden) return
						const target = event.target
						if (collectionCard.contains(target) || collectionRow?.contains(target) === true) return
						closeNow()
					}
					document.addEventListener('pointerdown', outsideListener, true)
					collectionCard.addEventListener('click', (event) => {
						const button = event.target.closest?.('.lp-fly-item')
						if (button === null || button === undefined) return
						// The shell's overflow entries are actions, not panels: they run
						// their real menu item instead of selecting a panel.
						const moreLabel = button.getAttribute('data-more-label')
						if (moreLabel !== null) {
							setCardOpen(false)
							void activateMoreEntry(moreLabel)
							return
						}
						const id = button.getAttribute('data-id')
						if (id !== null) chooseEntry(id)
					})
					// Keyboard: one ring over every row in the card, in reading order
					// (left column top-down, right column, then the overflow rows).
					collectionCard.addEventListener('keydown', (event) => {
						const items = [...collectionCard.querySelectorAll('.lp-fly-item')]
						if (items.length === 0) return
						const ring = cardRing()
						if (ring.length === 0) return
						const currentAt = ring.findIndex((node) => node.getAttribute('data-focus') === 'true')

						if (event.key === 'Escape') {
							event.preventDefault()
							closeNow()
							collectionRow.focus()
							return
						}
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault()
							const step = event.key === 'ArrowDown' ? 1 : -1
							const from = currentAt === -1 ? (step === 1 ? -1 : 0) : currentAt
							cardFocus.ring = (from + step + ring.length) % ring.length
						} else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
							event.preventDefault()
							// Row-major layout: the neighbour in the same visual row is one
							// step along the ring, so left/right is a single step, clamped
							// at the ends rather than wrapping into the other column.
							const step = event.key === 'ArrowRight' ? 1 : -1
							const from = currentAt === -1 ? 0 : currentAt
							const next = from + step
							if (next < 0 || next >= ring.length) return
							cardFocus.ring = next
						} else if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault()
							const active = ring[currentAt === -1 ? 0 : currentAt]
							if (active === undefined) return
							const moreLabel = active.getAttribute('data-more-label')
							if (moreLabel !== null) {
								setCardOpen(false)
								void activateMoreEntry(moreLabel)
								return
							}
							const id = active.getAttribute('data-id')
							if (id !== null) chooseEntry(id)
							return
						} else {
							return
						}
						markFocus()
						ring[cardFocus.ring]?.focus()
					})
				}

				/** Remove the injected row and card, if they exist. */
				function unmountCollection() {
					const launcher = findMoreLauncher()
					if (launcher !== null) launcher.wrapper.removeAttribute(MORE_HIDE_ATTR)
					if (collectionRow !== null) collectionRow.remove()
					if (collectionCard !== null) collectionCard.remove()
					if (outsideListener !== null) {
						document.removeEventListener('pointerdown', outsideListener, true)
						outsideListener = null
					}
					if (closeTimer !== 0) {
						window.clearTimeout(closeTimer)
						closeTimer = 0
					}
					collectionRow = null
					collectionCard = null
					collectionSignature = ''
				}

				/**
				 * Mount or refresh the injected row and card.
				 * @returns {boolean} whether the row is in the sidebar row list now
				 */
				function mountCollection() {
					const model = readRowModel()
					if (model === null) return false
					const { rowList, items } = model
					const signature = items.map((item) => item.id + ':' + item.label).join('|') + '@' + (collection.selectedId ?? '')
					if (collectionRow === null || collectionRow.parentNode !== rowList) {
						collectionRow?.remove()
						collectionRow = buildRow()
						// `firstElementChild`, not `firstChild`: the shell may leave a
						// whitespace text node ahead of the rows, and the injected row
						// must land above the first *element*.
						rowList.insertBefore(collectionRow, rowList.firstElementChild)
					}
					if (collectionCard === null) {
						collectionCard = buildCard()
						wireCollection()
						document.body.append(collectionCard)
					}
					// The shell's overflow launcher folds in here too; its entries become
					// the card's second layer, so nothing is lost by hiding the row.
					const launcher = findMoreLauncher()
					if (launcher !== null) launcher.wrapper.setAttribute(MORE_HIDE_ATTR, '')
					if (!moreHarvested) {
						moreHarvested = true
						void harvestMoreEntries().then((ok) => {
							if (!ok) {
								// A failed harvest must not leave the overflow unreachable:
								// put the launcher back and stop folding it.
								moreHarvested = false
								launcher?.wrapper.removeAttribute(MORE_HIDE_ATTR)
								return
							}
							collectionSignature = ''
							paint()
						})
					}
					// The rail (collapsed sidebar) has no room for text: the row keeps
					// its glyph and the selected entry's icon becomes a corner mark.
					const narrow = rowList.getBoundingClientRect().width < 120
					collectionRow.setAttribute('data-collapsed', narrow ? 'true' : 'false')
					collectionRow.setAttribute('data-has-selection', selectedPanel() === null ? 'false' : 'true')
					if (signature !== collectionSignature) {
						collectionSignature = signature
						fillCard(items)
						fillRow(items)
					}
					if (collectionRow.getAttribute('aria-expanded') === 'true') placeCard()
					return collectionRow.parentNode === rowList
				}

				/** Keep the card glued to its row while the page moves. */
				function trackCardPosition() {
					const reposition = () => {
						if (collectionCard !== null && collectionCard.hidden === false) placeCard()
					}
					window.addEventListener('resize', reposition)
					window.addEventListener('scroll', reposition, true)
					return () => {
						window.removeEventListener('resize', reposition)
						window.removeEventListener('scroll', reposition, true)
					}
				}

				/**
				 * Re-run the DOM pass from current state.
				 *
				 * Collection mode hides every panel row, so it is only allowed to do
				 * that once its own row is actually in the list: if the injection
				 * fails, the rows stay visible. "Hides nothing" is always the safe
				 * degradation, never "hides the menu with no way back".
				 */
				function paint() {
					let folded = false
					if (collection.enabled === true) {
						try {
							folded = mountCollection()
						} catch {
							folded = false
						}
						if (!folded) {
							try {
								unmountCollection()
							} catch {
								// Nothing to clean up if the row never mounted.
							}
						}
					}
					try {
						// Only panel rows fold. The shell's overflow launcher ("更多") is
						// left alone: it carries `sidebar.panellist.actions`, which the
						// card does not list, so hiding it would lose entries.
						const effective = folded ? panels.map((panel) => panel.id) : hidden
						applyRowMarks(effective, panels)
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
						setCollection(data?.collection)
					} catch {
						setHidden(hidden, 'load')
					}
				}

				/**
				 * Persist either half of the document. An omitted field means "leave
				 * it alone", so a hidden-set write never clobbers the collection
				 * setting and vice versa.
				 * @param {{ hidden?: string[], collection?: { enabled: boolean, selectedId: string | null } }} patch
				 */
				async function saveToHost(patch) {
					try {
						const response = await fetch(STATE_PATH, {
							method: 'POST',
							credentials: 'same-origin',
							cache: 'no-store',
							headers: { accept: 'application/json', 'content-type': 'application/json' },
							body: JSON.stringify(patch),
						})
						if (!response.ok) throw new Error('HTTP ' + response.status)
						const data = await response.json()
						setHidden(data?.hidden, null)
						setCollection(data?.collection)
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
					void saveToHost({ hidden })
				}

				function resetAll() {
					setHidden([], null)
					void saveToHost({ hidden: [] })
				}

				function toggleCollection() {
					const next = { enabled: collection.enabled !== true, selectedId: collection.selectedId }
					setCollection(next)
					void saveToHost({ collection: next })
					paint()
				}

				function clearStale() {
					const live = new Set(panels.map((panel) => panel.id))
					const kept = hidden.filter((id) => live.has(id))
					setHidden(kept, null)
					void saveToHost({ hidden: kept })
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

				/** The collection glyph, matching the row injected into the sidebar. */
				function CollectionIcon(props) {
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
					h('rect', { x: 1.8, y: 2.2, width: 12.4, height: 3.2, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.3 }),
					h('rect', { x: 1.8, y: 6.6, width: 12.4, height: 3.2, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.3, opacity: 0.62 }),
					h('rect', { x: 1.8, y: 11, width: 12.4, height: 3.2, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.3, opacity: 0.34 }))
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

						// The page keeps its original shape: the panel table comes first
						// and unchanged, and collection mode adds exactly one row at its
						// top — it is a switch, not a section of its own.
						h('section', { className: 'lp-section', 'data-section': 'panels' },
							h('div', { className: 'lp-section-head' },
								h('h2', { className: 'lp-h2' }, tFn('panelsTitle')),
								h('span', { className: 'lp-hint' }, tFn('panelsHint'))),
							h('div', { className: 'lp-card' },
								h('div', {
									className: 'lp-row',
									'data-row': 'collection',
									title: tFn('collectionHint'),
								},
								h('span', { className: 'lp-glyph', 'aria-hidden': 'true' }, h(CollectionIcon, { size: 15 })),
								h('span', { className: 'lp-main' },
									h('span', { className: 'lp-name' }, tFn('collectionName')),
									h('span', { className: 'lp-sub' }, tFn('collectionSub'))),
								h('span', {
									className: 'lp-tag',
									'data-tone': current.collection.enabled ? 'shown' : 'hidden',
								}, current.collection.enabled ? tFn('collectionOn') : tFn('collectionOff')),
								h(Switch, {
									checked: current.collection.enabled,
									label: tFn('collectionName') + ' — ' + (current.collection.enabled ? tFn('collectionOn') : tFn('collectionOff')),
									onToggle: toggleCollection,
								})),
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
						// Collection mode hides rows too, and its `hidden` set is the
						// user's own list (usually empty) — gating on that alone would
						// leave the observer detached while every row is folded.
						if (hidden.length === 0 && collection.enabled !== true) {
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
					// Every state change may flip whether the observer is needed, and
					// the rail width may have changed with it.
					const off = view.subscribe(() => {
						ensure()
						schedule()
					})
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

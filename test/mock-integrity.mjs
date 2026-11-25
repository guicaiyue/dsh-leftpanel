/**
 * 原型完整性自检。
 *
 * 这套东西防的是「原型与实现各说一套」这一类事故：
 *
 * 1. **一个仓库只许有一个可交互原型**。OpenDesign 的「设计文件」页按扩展名列出页面、
 *    不看 `.gitignore`，多留一个 html 就是多一个和定稿长得一样、路径还不同的页面——
 *    2026-11-23 的四个候选就摆在那儿，改原型时极容易点错。
 * 2. **定稿的三个画板必须同步**。收起 / 悬浮展开 / 空态竖着摞在一页里，条目数与徽标
 *    写死在 HTML 里，改一处忘另一处就会出现「徽标 7、卡片 5 项」。
 * 3. **原型里的字与量必须跟实现一致**。键盘提示与卡片宽度都是 `client/client.js`
 *    里的常量，原型另写一套就没人知道该信哪个。
 *
 * 只做静态断言，不跑浏览器；出图的对错由 `scripts/mock-shots.mjs` + 人眼看图保证。
 */
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { test } from 'node:test'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FINAL = join(ROOT, 'mock', 'collection-final.html')
const INDEX = join(ROOT, 'mock', 'index.html')
const CLIENT = join(ROOT, 'client', 'client.js')

const read = (path) => fs.readFileSync(path, 'utf8')

/**
 * Every `.html` in the repo, minus installed trees and dot-directories.
 *
 * Dot-directories are tool metadata, not prototypes: `.od-frames/` is written by
 * OpenDesign (three device frames, gitignored, and deleted from the working tree
 * on 2026-11-25 — OD rewrites it the next time the project is opened), and
 * OpenDesign's own file index skips them too — so counting them here would fail
 * on a clean checkout.
 */
function htmlFiles(dir = ROOT, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
		const path = join(dir, entry.name)
		if (entry.isDirectory()) htmlFiles(path, out)
		else if (entry.name.endsWith('.html')) out.push(relative(ROOT, path))
	}
	return out
}

/** Split the final page into its three boards, keyed by `state-*` id. */
function boards(html) {
	const found = new Map()
	const pattern = /<section class="frame" id="(state-[a-z]+)"[\s\S]*?(?=<section class="frame"|<\/main>)/g
	for (const match of html.matchAll(pattern)) found.set(match[1], match[0])
	return found
}

test('the repo keeps exactly one interactive prototype plus its index page', () => {
	assert.deepEqual(htmlFiles().sort(), ['mock/collection-final.html', 'mock/index.html'])
})

test('every image and board anchor the index links to exists', () => {
	const index = read(INDEX)
	const final = read(FINAL)
	const srcs = [...index.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
	assert.ok(srcs.length >= 6, `index should show at least the six state shots, saw ${srcs.length}`)
	for (const src of new Set(srcs)) {
		assert.ok(fs.existsSync(join(ROOT, 'mock', src)), `missing image: mock/${src}`)
	}
	const anchors = [...index.matchAll(/href="collection-final\.html#([\w-]+)"/g)].map((m) => m[1])
	assert.ok(anchors.length > 0, 'index should deep-link into the final prototype')
	for (const anchor of new Set(anchors)) {
		assert.ok(final.includes(`id="${anchor}"`), `final has no anchor #${anchor}`)
	}
})

test('the three boards agree on how many entries the card holds', () => {
	const found = boards(read(FINAL))
	assert.deepEqual([...found.keys()].sort(), ['state-closed', 'state-empty', 'state-open'])
	const counts = []
	const badges = []
	for (const [id, html] of found) {
		counts.push([id, (html.match(/class="pop-item/g) ?? []).length])
		const badge = html.match(/class="badge">(\d+)</)
		assert.ok(badge !== null, `${id} has no count badge`)
		badges.push([id, Number(badge[1])])
	}
	// 收起画板是关着的，卡片不在 DOM 里；另外两个必须一致。
	const open = counts.filter(([id]) => id !== 'state-closed')
	assert.equal(open.length, 2)
	assert.equal(open[0][1], open[1][1], `card sizes drifted: ${JSON.stringify(open)}`)
	assert.ok(open[0][1] >= badges[0][1], 'the card must hold at least as many entries as the badge counts')
	for (const [id, value] of badges) {
		assert.equal(value, badges[0][1], `${id} badge drifted: ${JSON.stringify(badges)}`)
	}
})

test('the prototype quotes the shipped keyboard hints verbatim', () => {
	const client = read(CLIENT)
	const hint = client.match(/collectionKeysMove: '([^']+)'/)
	const open = client.match(/collectionKeysOpen: '([^']+)'/)
	assert.ok(hint !== null && open !== null, 'client.js should still declare the collection hints')
	const final = read(FINAL)
	assert.ok(final.includes(hint[1]), `prototype hint drifted from client.js: ${hint[1]}`)
	for (const part of open[1].split(' · ')) {
		const key = part.split(' ')[0]
		assert.ok(final.includes(`<kbd>${key}</kbd>`), `prototype is missing the ${key} hint`)
	}
})

test('the prototype card is as wide as the implementation opens it', () => {
	const client = read(CLIENT)
	const width = client.match(/const CARD_WIDTH = (\d+)/)
	assert.ok(width !== null, 'client.js should still declare CARD_WIDTH')
	const final = read(FINAL)
	const popover = final.match(/\.popover\{[\s\S]*?width:(\d+)px/)
	assert.ok(popover !== null, 'the prototype should size .popover explicitly')
	assert.equal(popover[1], width[1], 'prototype card width drifted from CARD_WIDTH')
})
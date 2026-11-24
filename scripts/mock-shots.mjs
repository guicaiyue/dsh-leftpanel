#!/usr/bin/env node
/**
 * 重出定稿原型的三态 × 两主题截图。
 *
 * 「展开」的图曾经实际是「收起」画板：`collection-final.html` 把三个状态竖着摞在
 * 一张页面里，固定视口只能拍到最上面那个，旧的出图脚本也没有按画板裁切。这里
 * 逐个画板用 `--clip-selector` 出图，文件名与画板一一对应，改完原型重跑一次即可。
 *
 *   node scripts/mock-shots.mjs
 *
 * 需要本机有 google-chrome-stable（headless=new），以及 scripts/shot.mjs。
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PAGE = 'mock/collection-final.html'

/** 画板 id ← 文件名里的状态词。 */
const STATES = ['closed', 'open', 'empty']
const THEMES = ['dark', 'light']

const results = []
for (const state of STATES) {
	for (const theme of THEMES) {
		const out = `mock/shots/final-${state}-${theme}.png`
		const result = spawnSync(
			process.execPath,
			[
				join(HERE, 'shot.mjs'),
				PAGE,
				out,
				'1440',
				'900',
				'--eval',
				`document.documentElement.dataset.theme='${theme}'`,
				'--clip-selector',
				`#state-${state}`,
			],
			{ cwd: ROOT, encoding: 'utf8' },
		)
		if (result.status !== 0) {
			console.error(`failed: ${out}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
			process.exit(1)
		}
		results.push((result.stdout ?? '').trim())
	}
}
for (const line of results) console.log(line)

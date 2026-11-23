#!/usr/bin/env node
/**
 * 无依赖截图工具：用 CDP 打开一个本地 HTML 或 http 地址，按给定视口出图，
 * 可选在截图前执行一段 JS（用于切主题、切方向、模拟 hover）。
 *
 *   node scripts/shot.mjs <file|url> <out.png> [w] [h] [--eval 'js'] [--wait ms] [--dpr n]
 *
 * README 图用 1500×1000、DPR 1 直出（与 dsh-context-domains 等插件现有的图同一套：
 * 侧栏右边界落在 280）。别按 DPR 2 出图再缩放——那样每张图的像素尺寸都不一样。
 *
 * 例：
 *   node scripts/shot.mjs mock/collection-A.html mock/shots/A-dark.png 1440 900
 *   node scripts/shot.mjs mock/collection-A.html out.png 1440 900 --eval "document.body.dataset.theme='light'"
 *
 * 需要本机有 google-chrome-stable（headless=new）。只用 Node 内置模块。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [target, out, w = '1440', h = '900', ...rest] = process.argv.slice(2)
if (!target || !out) {
	console.error('usage: node scripts/shot.mjs <file|url> <out.png> [w] [h] [--eval js] [--wait ms]')
	process.exit(2)
}
const W = Number(w)
const H = Number(h)
const flag = (name, fallback) => {
	const index = rest.indexOf(name)
	return index >= 0 && rest[index + 1] !== undefined ? rest[index + 1] : fallback
}
const evalJs = flag('--eval', '')
const waitMs = Number(flag('--wait', '1200'))
const dpr = Number(flag('--dpr', '1'))
const url = /^https?:/.test(target) ? target : pathToFileURL(resolve(target)).href

const dir = mkdtempSync(join(tmpdir(), 'dsh-shot-'))
const port = 9400 + Math.floor(Math.random() * 500)
const chrome = spawn(
	'google-chrome-stable',
	[
		'--headless=new',
		'--disable-gpu',
		'--no-sandbox',
		'--hide-scrollbars',
		`--window-size=${W},${H}`,
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${join(dir, 'profile')}`,
		'--no-first-run',
		'--no-default-browser-check',
		'about:blank',
	],
	{ stdio: 'ignore' },
)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function firstTarget() {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
			if (list.length > 0) return list[0]
		} catch {
			// Chrome is still starting.
		}
		await sleep(200)
	}
	throw new Error('chrome did not expose a debug target')
}

const target0 = await firstTarget()
const ws = new WebSocket(target0.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.onmessage = (event) => {
	const message = JSON.parse(event.data)
	if (message.id && pending.has(message.id)) {
		pending.get(message.id)(message)
		pending.delete(message.id)
	}
}
await new Promise((done) => {
	ws.onopen = done
})
const send = (method, params = {}) =>
	new Promise((done) => {
		seq += 1
		pending.set(seq, done)
		ws.send(JSON.stringify({ id: seq, method, params }))
	})

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: false })
await send('Page.navigate', { url })
await sleep(waitMs)
if (evalJs !== '') {
	await send('Runtime.evaluate', { expression: evalJs, returnByValue: true, awaitPromise: true })
	await sleep(400)
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(`shot: ${out} (${W}x${H})`)
ws.close()
chrome.kill()

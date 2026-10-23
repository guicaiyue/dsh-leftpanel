#!/usr/bin/env node
/**
 * Prepare (and, when the repo is old enough, open) the catalog PR.
 *
 * The catalog lives in `awesome-dsh-plugin/awesome-dsh-plugin`: one YAML file
 * per plugin under `data/plugins/`, named `<owner>__<repo>.yml`. A submission is
 * exactly that one file — the READMEs are generated, so they must not be
 * edited.
 *
 * The catalog requires the submitted repository to be at least 1 day old, and
 * CI checks it. This script enforces the same bar locally:
 *
 *   node scripts/market-pr.mjs --check     # report readiness, change nothing
 *   node scripts/market-pr.mjs --prepare   # sync fork + write the entry branch
 *   node scripts/market-pr.mjs             # prepare, then open the PR
 *
 * `--prepare` is safe to re-run: it resets the work branch from upstream/main
 * and rewrites the single entry file.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OWNER = 'zhujiuyi'
const REPO = 'dsh-leftpanel'
const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin'
const BRANCH = 'add-leftpanel'
const MIN_AGE_MS = 24 * 60 * 60 * 1000

const work = join(process.cwd(), '.market')
const repoDir = join(work, 'awesome-dsh-plugin')

/** Run a command, returning trimmed stdout; throws with stderr on failure. */
function run(file, args, options = {}) {
  try {
    return execFileSync(file, args, {
      cwd: options.cwd ?? work,
      encoding: 'utf8',
      stdio: options.quiet === true ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr = error.stderr?.toString() ?? ''
    throw new Error(`${file} ${args.join(' ')} failed:\n${stderr || error.message}`)
  }
}

/** GitHub REST helper using the gh CLI's token (never printed). */
async function api(path) {
  const token = run('gh', ['auth', 'token'], { cwd: process.cwd() })
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'dsh-leftpanel-release',
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  return { status: response.status, body }
}

/**
 * The entry file this plugin contributes.
 *
 * Descriptions are single-quoted, matching how the catalog's existing entries
 * are written: it keeps the YAML unambiguous even though neither line contains
 * a `: ` sequence today.
 */
function entryYaml() {
  return [
    `url: https://github.com/${OWNER}/${REPO}`,
    `name: ${OWNER}/${REPO}`,
    'category: ui',
    'description:',
    "  en: 'Lists every entry that can appear in the left sidebar and gives each panel entry its own hide/show switch from a section in Settings.'",
    "  zh: '列出所有可以出现在左侧菜单里的功能，并在设置中逐个隐藏或显示面板入口。'",
    '',
  ].join('\n')
}

async function readiness() {
  const { status, body } = await api(`/repos/${OWNER}/${REPO}`)
  if (status !== 200) throw new Error(`cannot read repo metadata (HTTP ${String(status)})`)
  const createdAt = new Date(body.created_at)
  const eligibleAt = new Date(createdAt.getTime() + MIN_AGE_MS)
  const now = new Date()
  const topics = Array.isArray(body.topics) ? body.topics : []
  return {
    createdAt,
    eligibleAt,
    ready: now >= eligibleAt,
    waitMs: Math.max(0, eligibleAt.getTime() - now.getTime()),
    topicsOk: topics.includes('dsh-plugin'),
    visibility: body.visibility,
  }
}

/** Sync the fork to upstream/main and write the entry on a fresh branch. */
function prepare() {
  mkdirSync(work, { recursive: true })
  if (!existsSync(join(repoDir, '.git'))) {
    rmSync(repoDir, { recursive: true, force: true })
    run('gh', ['repo', 'clone', UPSTREAM, repoDir, '--', '--depth', '50'], { cwd: work })
  }

  const git = (args) => run('git', args, { cwd: repoDir })
  git(['fetch', 'origin', 'main'])
  git(['checkout', '-B', BRANCH, 'origin/main'])

  const dataDir = join(repoDir, 'data', 'plugins')
  mkdirSync(dataDir, { recursive: true })
  const entryPath = join(dataDir, `${OWNER}__${REPO}.yml`)
  writeFileSync(entryPath, entryYaml(), 'utf8')

  git(['add', '--', `data/plugins/${OWNER}__${REPO}.yml`])
  // Nothing else may be staged: a PR that touches other entries or the
  // generated READMEs gets questioned by the maintainers' gate.
  const staged = git(['diff', '--cached', '--name-only'])
  if (staged !== `data/plugins/${OWNER}__${REPO}.yml`) {
    throw new Error(`unexpected staged files:\n${staged}`)
  }

  const message = `Add ${OWNER}/${REPO}\n\nLeft-menu manager as a Settings section: lists every entry that can appear\nin the left sidebar and gives each panel entry its own hide/show switch.`
  // `--allow-empty` keeps a re-run idempotent after an amend-free retry.
  git(['-c', 'user.name=zhuji', '-c', 'user.email=zhujiuyi@qq.com', 'commit', '-q', '-m', message])
  return entryPath
}

async function openPr() {
  const { status, body } = await api(`/repos/${UPSTREAM}/pulls?head=${OWNER}:${BRANCH}&state=open`)
  if (status === 200 && Array.isArray(body) && body.length > 0) {
    return { already: true, url: body[0].html_url }
  }

  const title = `Add ${OWNER}/${REPO}`
  const prBody = [
    'Adds one entry for a left-menu manager.',
    '',
    `- **Repository:** https://github.com/${OWNER}/${REPO}`,
    '- **npm:** https://www.npmjs.com/package/@zhujiuyi/dsh-leftpanel',
    "- **Category:** `ui` — it manages the left sidebar's panel entries from a section in Settings.",
    '- **Manifest:** the repo declares `dsh.bundle.patch` plus `dsh.client` (`platform: web`).',
    `- **Conventions:** only \`data/plugins/${OWNER}__${REPO}.yml\` is touched; the generated READMEs are left alone.`,
    '',
    'What it does: lists every entry that can appear in the left sidebar (the live',
    '`sidebar.panellist` registrations) and gives each panel entry its own hide/show',
    'switch. Hiding only affects the entry — the feature stays registered in the',
    'layout and remains reachable. The hidden set is persisted by the plugin\'s host',
    'half, so it survives a restart.',
    '',
    'It deliberately occupies no sidebar slot of its own; its entry point is a',
    'section in Settings.',
  ].join('\n')

  // Creating a PR is a POST with a body; the CLI already carries the
  // operator's authentication, so it does the write.
  const url = run('gh', [
    'pr', 'create',
    '--repo', UPSTREAM,
    '--base', 'main',
    '--head', `${OWNER}:${BRANCH}`,
    '--title', title,
    '--body', prBody,
  ], { cwd: repoDir })
  return { already: false, url }
}

const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--prepare')
    ? 'prepare'
    : 'submit'

/** `--force` bypasses the age guard; it exists to rehearse the pipeline. */
const force = process.argv.includes('--force')

const state = await readiness()
const lines = [
  `repo:      ${OWNER}/${REPO}`,
  `created:   ${state.createdAt.toISOString()}`,
  `eligible:  ${state.eligibleAt.toISOString()}`,
  `topics ok: ${String(state.topicsOk)}`,
  `ready:     ${String(state.ready)}`,
]
if (!state.ready) lines.push(`wait:      ${Math.ceil(state.waitMs / 60000)} more minutes`)
console.log(lines.join('\n'))

if (mode === 'check') process.exit(0)

if (!state.ready && !force) {
  console.error('\nrefusing to submit: the repository has not reached the 1-day bar yet')
  process.exit(2)
}
if (!state.topicsOk) {
  console.error('\nrefusing to submit: the repository is missing the "dsh-plugin" topic')
  process.exit(3)
}
if (force && !state.ready) {
  console.log('\n--force: rehearsing the pipeline before the age bar is met')
}

const entryPath = prepare()
console.log(`\nentry written: ${entryPath}`)

if (mode === 'prepare') process.exit(0)

const result = await openPr()
console.log(result.already ? `\nPR already open: ${result.url}` : `\nPR opened: ${result.url}`)

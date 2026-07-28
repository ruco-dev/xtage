/**
 * stagehand — deterministic Claude Code hook layer for xtage.
 * Generates gate/flag/clear/dirty scripts and wires them into .claude/settings.local.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  repoDir, XTAGE_HOME, readFile,
  repoHooksDir, sessionDir, statePath,
  codeIndexPath, repoMdPath,
  stripFrontmatter, readFrontmatter,
} from './store.js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HookPaths {
  gate: string
  flag: string
  clear: string
  dirty: string
}

interface SettingsJson {
  hooks?: {
    SessionStart?: HookEntry[]
    PreToolUse?: HookEntry[]
    PostToolUse?: HookEntry[]
    [key: string]: HookEntry[] | undefined
  }
  [key: string]: unknown
}

interface HookEntry {
  matcher?: string
  hooks: Array<{ type: string; command: string }>
}

// ─── Script generators ─────────────────────────────────────────────────────

export function generateGateMjs(repoName: string, projectRoot: string): string {
  const rn = JSON.stringify(repoName)
  const pr = JSON.stringify(projectRoot)
  return [
    `#!/usr/bin/env node`,
    `import { readFileSync, existsSync } from 'fs';`,
    `import { homedir } from 'os';`,
    `import { join, relative } from 'path';`,
    ``,
    `const REPO_NAME = ${rn};`,
    `const PROJECT_ROOT = ${pr};`,
    `const REPO_DIR = join(homedir(), 'xtage', REPO_NAME);`,
    `const STATE_FILE = join(REPO_DIR, 'state.json');`,
    `const SESSION_DIR = join(REPO_DIR, 'session');`,
    `const CONSULTED_FILE = join(SESSION_DIR, 'consulted.json');`,
    `const DIRTY_FILE = join(SESSION_DIR, 'dirty.json');`,
    `const CHUNKS_DIR = join(REPO_DIR, 'files');`,
    ``,
    `const raw = readFileSync(0, 'utf-8');`,
    `let input;`,
    `try { input = JSON.parse(raw); } catch { process.exit(0); }`,
    ``,
    `const toolName = input.tool_name ?? '';`,
    `if (toolName.startsWith('mcp__xtage__')) process.exit(0);`,
    ``,
    `if (!existsSync(STATE_FILE)) process.exit(0);`,
    `let state;`,
    `try { state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { process.exit(0); }`,
    `if (state.enabled !== true) process.exit(0);`,
    ``,
    `function readJson(p) {`,
    `  if (!existsSync(p)) return {};`,
    `  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }`,
    `}`,
    ``,
    `function slugify(filePath) {`,
    `  let rel;`,
    `  try { rel = relative(PROJECT_ROOT, filePath); } catch { return null; }`,
    `  if (!rel || rel.startsWith('..')) return null;`,
    `  return rel.replace(/[/\\\\]/g, '-') + '.md';`,
    `}`,
    ``,
    `if (toolName === 'Read') {`,
    `  const filePath = input.tool_input?.file_path ?? '';`,
    `  if (!filePath) process.exit(0);`,
    `  const slug = slugify(filePath);`,
    `  if (!slug) process.exit(0);`,
    `  const chunkFile = join(CHUNKS_DIR, slug);`,
    `  if (!existsSync(chunkFile)) process.exit(0);`,
    `  if (readJson(DIRTY_FILE)[slug]) process.exit(0);`,
    `  if (readJson(CONSULTED_FILE)[slug]) process.exit(0);`,
    `  let origTokens = null;`,
    `  try {`,
    `    const cc = readFileSync(chunkFile, 'utf-8');`,
    `    const m = cc.match(/^original_tokens:\\s*(\\d+)$/m);`,
    `    if (m) origTokens = parseInt(m[1], 10);`,
    `  } catch {}`,
    `  const note = origTokens ? ' (' + origTokens + ' tokens)' : '';`,
    `  process.stderr.write(`,
    `    '[xtage] A summary of this file exists' + note + '.\\n' +`,
    `    'Call mcp__xtage__read_file_chunk with repo_name=' + JSON.stringify(REPO_NAME) +`,
    `    ' filename=' + JSON.stringify(slug) + ' first.\\n' +`,
    `    'Read raw source only if the summary is insufficient.\\n'`,
    `  );`,
    `  process.exit(1);`,
    `}`,
    ``,
    `if (toolName === 'Grep' || toolName === 'Glob') {`,
    `  if (readJson(CONSULTED_FILE)['_codeindex']) process.exit(0);`,
    `  process.stderr.write(`,
    `    '[xtage] xtage has a CODEINDEX for this repo.\\n' +`,
    `    'Call mcp__xtage__read_codeindex with repo_name=' + JSON.stringify(REPO_NAME) + ' before searching.\\n' +`,
    `    'This message appears once per session.\\n'`,
    `  );`,
    `  process.exit(1);`,
    `}`,
    ``,
    `process.exit(0);`,
    ``,
  ].join('\n')
}

export function generateFlagMjs(repoName: string): string {
  const rn = JSON.stringify(repoName)
  return [
    `#!/usr/bin/env node`,
    `import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';`,
    `import { homedir } from 'os';`,
    `import { join } from 'path';`,
    ``,
    `const REPO_NAME = ${rn};`,
    `const SESSION_DIR = join(homedir(), 'xtage', REPO_NAME, 'session');`,
    `const CONSULTED_FILE = join(SESSION_DIR, 'consulted.json');`,
    ``,
    `const raw = readFileSync(0, 'utf-8');`,
    `let input;`,
    `try { input = JSON.parse(raw); } catch { process.exit(0); }`,
    ``,
    `const toolName = input.tool_name ?? '';`,
    `let key = null;`,
    `if (toolName === 'mcp__xtage__read_file_chunk') {`,
    `  key = input.tool_input?.filename ?? null;`,
    `} else if (toolName === 'mcp__xtage__read_codeindex') {`,
    `  key = '_codeindex';`,
    `}`,
    `if (!key) process.exit(0);`,
    ``,
    `// Sanitize key to printable ASCII`,
    `key = key.replace(/[^\\x20-\\x7E]/g, '').slice(0, 256);`,
    ``,
    `try {`,
    `  let consulted = {};`,
    `  if (existsSync(CONSULTED_FILE)) {`,
    `    try { consulted = JSON.parse(readFileSync(CONSULTED_FILE, 'utf-8')); } catch {}`,
    `  }`,
    `  consulted[key] = new Date().toISOString();`,
    `  mkdirSync(SESSION_DIR, { recursive: true });`,
    `  writeFileSync(CONSULTED_FILE, JSON.stringify(consulted, null, 2));`,
    `} catch (e) {`,
    `  process.stderr.write('[xtage] warning: could not write flag: ' + e.message + '\\n');`,
    `}`,
    ``,
  ].join('\n')
}

export function generateClearMjs(repoName: string): string {
  const rn = JSON.stringify(repoName)
  return [
    `#!/usr/bin/env node`,
    `import { writeFileSync, mkdirSync } from 'fs';`,
    `import { homedir } from 'os';`,
    `import { join } from 'path';`,
    ``,
    `const REPO_NAME = ${rn};`,
    `const SESSION_DIR = join(homedir(), 'xtage', REPO_NAME, 'session');`,
    `const CONSULTED_FILE = join(SESSION_DIR, 'consulted.json');`,
    ``,
    `try {`,
    `  mkdirSync(SESSION_DIR, { recursive: true });`,
    `  writeFileSync(CONSULTED_FILE, '{}');`,
    `} catch (e) {`,
    `  process.stderr.write('[xtage] warning: could not clear session flags: ' + e.message + '\\n');`,
    `}`,
    ``,
  ].join('\n')
}

export function generateDirtyMjs(repoName: string, projectRoot: string): string {
  const rn = JSON.stringify(repoName)
  const pr = JSON.stringify(projectRoot)
  return [
    `#!/usr/bin/env node`,
    `import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';`,
    `import { homedir } from 'os';`,
    `import { join, relative } from 'path';`,
    `import { execSync } from 'child_process';`,
    ``,
    `const REPO_NAME = ${rn};`,
    `const PROJECT_ROOT = ${pr};`,
    `const SESSION_DIR = join(homedir(), 'xtage', REPO_NAME, 'session');`,
    `const DIRTY_FILE = join(SESSION_DIR, 'dirty.json');`,
    `const MEMORY_RE = /[\\/\\\\.]+\\.claude[\\/\\\\]+projects[\\/\\\\]+[^\\/\\\\]+[\\/\\\\]+memory[\\/\\\\]+[^\\/\\\\]+\\.md$/;`,
    ``,
    `const raw = readFileSync(0, 'utf-8');`,
    `let input;`,
    `try { input = JSON.parse(raw); } catch { process.exit(0); }`,
    ``,
    `const filePath = input.tool_input?.file_path ?? input.tool_input?.path ?? '';`,
    `if (!filePath) process.exit(0);`,
    ``,
    `if (MEMORY_RE.test(filePath)) {`,
    `  const safe = filePath.replace(/"/g, '\\\\"');`,
    `  try { execSync('xtage sync-memory --file "' + safe + '"', { stdio: 'ignore', timeout: 10000 }); } catch {}`,
    `  process.exit(0);`,
    `}`,
    ``,
    `let rel;`,
    `try { rel = relative(PROJECT_ROOT, filePath); } catch { process.exit(0); }`,
    `if (!rel || rel.startsWith('..')) process.exit(0);`,
    `const slug = rel.replace(/[/\\\\]/g, '-') + '.md';`,
    ``,
    `try {`,
    `  let dirty = {};`,
    `  if (existsSync(DIRTY_FILE)) {`,
    `    try { dirty = JSON.parse(readFileSync(DIRTY_FILE, 'utf-8')); } catch {}`,
    `  }`,
    `  dirty[slug] = new Date().toISOString();`,
    `  mkdirSync(SESSION_DIR, { recursive: true });`,
    `  writeFileSync(DIRTY_FILE, JSON.stringify(dirty, null, 2));`,
    `} catch (e) {`,
    `  process.stderr.write('[xtage] warning: could not write dirty flag: ' + e.message + '\\n');`,
    `}`,
    ``,
  ].join('\n')
}

// ─── Script emission ────────────────────────────────────────────────────────

export function emitHookScripts(repoName: string, projectRoot: string): HookPaths {
  const hooksDir = repoHooksDir(repoName)
  mkdirSync(hooksDir, { recursive: true })

  const paths: HookPaths = {
    gate: join(hooksDir, 'gate.mjs'),
    flag: join(hooksDir, 'flag.mjs'),
    clear: join(hooksDir, 'clear.mjs'),
    dirty: join(hooksDir, 'dirty.mjs'),
  }

  writeFileSync(paths.gate, generateGateMjs(repoName, projectRoot))
  writeFileSync(paths.flag, generateFlagMjs(repoName))
  writeFileSync(paths.clear, generateClearMjs(repoName))
  writeFileSync(paths.dirty, generateDirtyMjs(repoName, projectRoot))

  for (const p of Object.values(paths)) {
    try { chmodSync(p, 0o644) } catch { /* non-fatal */ }
  }

  return paths
}

// ─── Settings merge ─────────────────────────────────────────────────────────

const XTAGE_CONTEXT_CMD = 'xtage context'

function hooksMarker(repoName: string): string {
  return `/xtage/${repoName}/hooks/`
}

function readSettingsJson(settingsPath: string): SettingsJson {
  if (!existsSync(settingsPath)) return {}
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as SettingsJson
  } catch {
    throw new Error(
      `xtage install: ${settingsPath} is not valid JSON — fix or delete it, then re-run`
    )
  }
}

function writeSettingsJson(settingsPath: string, settings: SettingsJson): void {
  mkdirSync(join(settingsPath, '..'), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
}

export function mergeHooksIntoSettings(
  settingsPath: string,
  repoName: string,
  hookPaths: HookPaths,
  cliPath: string,
  includeGate = true,
): void {
  const settings = readSettingsJson(settingsPath)
  settings.hooks ??= {}

  const marker = hooksMarker(repoName)
  const contextCmd = `node "${cliPath}" context`

  // Clear existing xtage entries for this repo (idempotent)
  const filterXtage = (arr: HookEntry[] = []): HookEntry[] =>
    arr.filter(e => {
      const cmd = e.hooks?.[0]?.command ?? ''
      return !cmd.includes(marker) && cmd !== XTAGE_CONTEXT_CMD && cmd !== contextCmd
    })

  settings.hooks.SessionStart = filterXtage(settings.hooks.SessionStart)
  settings.hooks.PreToolUse = filterXtage(settings.hooks.PreToolUse)
  settings.hooks.PostToolUse = filterXtage(settings.hooks.PostToolUse)

  // SessionStart: clear flags + inject digest
  settings.hooks.SessionStart.push(
    { hooks: [{ type: 'command', command: `node "${hookPaths.clear}"` }] },
    { hooks: [{ type: 'command', command: contextCmd }] },
  )

  // PreToolUse: gate (optional)
  if (includeGate) {
    settings.hooks.PreToolUse.push({
      matcher: 'Read|Grep|Glob',
      hooks: [{ type: 'command', command: `node "${hookPaths.gate}"` }],
    })
  }

  // PostToolUse: flag + dirty
  settings.hooks.PostToolUse.push(
    {
      matcher: 'mcp__xtage__read_file_chunk|mcp__xtage__read_codeindex',
      hooks: [{ type: 'command', command: `node "${hookPaths.flag}"` }],
    },
    {
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: `node "${hookPaths.dirty}"` }],
    },
  )

  writeSettingsJson(settingsPath, settings)
}

export function removeHooksFromSettings(settingsPath: string, repoName: string, cliPath?: string): void {
  if (!existsSync(settingsPath)) return
  const settings = readSettingsJson(settingsPath)
  if (!settings.hooks) return

  const marker = hooksMarker(repoName)
  const contextCmd = cliPath ? `node "${cliPath}" context` : undefined

  const filterXtage = (arr: HookEntry[] = []): HookEntry[] =>
    arr.filter(e => {
      const cmd = e.hooks?.[0]?.command ?? ''
      if (cmd.includes(marker)) return false
      if (cmd === XTAGE_CONTEXT_CMD) return false
      if (contextCmd && cmd === contextCmd) return false
      return true
    })

  settings.hooks.SessionStart = filterXtage(settings.hooks.SessionStart)
  settings.hooks.PreToolUse = filterXtage(settings.hooks.PreToolUse)
  settings.hooks.PostToolUse = filterXtage(settings.hooks.PostToolUse)

  writeSettingsJson(settingsPath, settings)
}

// ─── Context digest ─────────────────────────────────────────────────────────

export function buildContextDigest(repoName: string): string | null {
  const repoMd = readFile(repoMdPath(repoName))
  const codeIndex = readFile(codeIndexPath(repoName))

  if (!repoMd && !codeIndex) return null

  const parts: string[] = [`## xtage — ${repoName}`]

  if (repoMd) {
    const body = stripFrontmatter(repoMd).trim()
    // First 400 chars of REPO.md
    const excerpt = body.length > 400 ? body.slice(0, 400) + '…' : body
    parts.push(`\n### REPO\n${excerpt}`)
  }

  if (codeIndex) {
    const body = stripFrontmatter(codeIndex)
    // First 60 lines of CODEINDEX
    const lines = body.split('\n').slice(0, 60)
    parts.push(`\n### CODEINDEX (top)\n${lines.join('\n')}`)
  }

  // Staleness note
  const dirtyFile = join(repoDir(repoName), 'session', 'dirty.json')
  let staleNote = ''
  if (existsSync(dirtyFile)) {
    try {
      const dirty = JSON.parse(readFileSync(dirtyFile, 'utf-8')) as Record<string, string>
      const n = Object.keys(dirty).length
      if (n > 0) staleNote = `⚠ ${n} chunk${n > 1 ? 's' : ''} stale — run \`xtage update\``
    } catch { /* ignore */ }
  }

  // Coverage
  const chunksDir = join(repoDir(repoName), 'files')
  let coverageNote = ''
  if (existsSync(chunksDir)) {
    try {
      const chunkCount = readdirSync(chunksDir).filter(f => f.endsWith('.md')).length
      coverageNote = `${chunkCount} file summaries indexed`
    } catch { /* ignore */ }
  }

  const statusParts = [coverageNote, staleNote].filter(Boolean)
  if (statusParts.length > 0) {
    parts.push(`\n### Index status\n${statusParts.join(' · ')}`)
  }

  return parts.join('\n')
}

// ─── Git hook ───────────────────────────────────────────────────────────────

const GIT_HOOK_LINE = 'xtage update 2>/dev/null || true'

export function installGitHook(projectRoot: string): boolean {
  const gitDir = join(projectRoot, '.git')
  if (!existsSync(gitDir)) return false

  const hooksDir = join(gitDir, 'hooks')
  mkdirSync(hooksDir, { recursive: true })

  const hookPath = join(hooksDir, 'post-commit')
  let content = ''
  if (existsSync(hookPath)) {
    content = readFileSync(hookPath, 'utf-8')
    if (content.includes(GIT_HOOK_LINE)) return true // already installed
  } else {
    content = '#!/bin/sh\n'
  }

  content = content.trimEnd() + '\n' + GIT_HOOK_LINE + '\n'
  writeFileSync(hookPath, content)
  try { chmodSync(hookPath, 0o755) } catch { /* non-fatal */ }
  return true
}

export function removeGitHook(projectRoot: string): void {
  const hookPath = join(projectRoot, '.git', 'hooks', 'post-commit')
  if (!existsSync(hookPath)) return

  const content = readFileSync(hookPath, 'utf-8')
  const updated = content
    .split('\n')
    .filter(line => line.trim() !== GIT_HOOK_LINE.trim())
    .join('\n')

  if (updated !== content) writeFileSync(hookPath, updated)
}

// ─── State management ────────────────────────────────────────────────────────

export function writeState(repoName: string, enabled: boolean): void {
  const dir = repoDir(repoName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(statePath(repoName), JSON.stringify({ enabled, installed_at: new Date().toISOString() }, null, 2))
}

export function readState(repoName: string): { enabled: boolean } | null {
  const p = statePath(repoName)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) as { enabled: boolean } } catch { return null }
}

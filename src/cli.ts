#!/usr/bin/env node
import { spawnSync, execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { makeProgressFile, readProgress, removeProgress, type ProgressState } from './progress.js'
import { VERSION } from './version.js'
import {
  lookupRepo, registerRepo, readFile, codeIndexPath, readFrontmatter,
  repoNameFromMemoryPath, projectInsightsPath,
  stripFrontmatter, writeXtageFile,
} from './store.js'
import {
  removeHooksFromSettings, buildContextDigest, removeGitHook, writeState,
} from './stagehand.js'
import { parseGitDiff, getGitDiff } from './hook.js'
import { buildRepoInitPrompt, buildRepoUpdatePrompt, buildSessionStartPrompt, buildSessionEndPrompt } from './prompts.js'
import { promptTelemetryOptIn } from './telemetry.js'
import { xtageMcpConfig, exitUnlessIndexed, runInstall } from './init-runner.js'

const HELP = `xtage <command> [options]

Commands:
  init [repo-url]       Index a repository via AI (auto-detects git remote if omitted)
  install [--no-gate]   Wire Claude Code hooks into .claude/settings.local.json
  uninstall             Remove hooks and disable xtage for this project
  update                Incrementally update index after commits
  context               Print SessionStart digest as additionalContext JSON
  sync-memory --file    Sync a Claude memory file into PROJECTINSIGHTS.md
  start                 (deprecated) alias for install
  end                   (deprecated) no-op
  status                Show index status and staleness
  link [repo-url]       Register current directory in the local repo registry
  serve                 Start the MCP server on stdio

Options:
  -h, --help            Show this help
  -v, --version         Print version

Examples:
  xtage init
  xtage install
  xtage install --no-gate
  xtage uninstall
  xtage context
  xtage update
  xtage status
  xtage link https://github.com/org/repo`

const XTAGE_TOOLS = [
  'mcp__xtage__register_repo',
  'mcp__xtage__fetch_repo_data',
  'mcp__xtage__fetch_local_repo_data',
  'mcp__xtage__lookup_repo',
  'mcp__xtage__get_session_stats',
  'mcp__xtage__read_repo_md',
  'mcp__xtage__write_repo_md',
  'mcp__xtage__read_project_insights',
  'mcp__xtage__write_project_insights',
  'mcp__xtage__write_general_insights',
  'mcp__xtage__read_codeindex',
  'mcp__xtage__write_codeindex',
  'mcp__xtage__list_file_chunks',
  'mcp__xtage__get_file',
  'mcp__xtage__read_file_chunk',
  'mcp__xtage__write_file_chunk',
  'mcp__xtage__check_for_updates',
  'mcp__xtage__sync_from_claude_memory',
]

function ensureXtagePermissions(): void {
  const dir = join(process.cwd(), '.claude')
  const settingsPath = join(dir, 'settings.json')

  let settings: { permissions?: { allow?: string[] } } = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) } catch { /* start fresh */ }
  }

  settings.permissions ??= {}
  settings.permissions.allow ??= []

  const existing = new Set(settings.permissions.allow)
  const added = XTAGE_TOOLS.filter(t => !existing.has(t))
  if (added.length === 0) return

  settings.permissions.allow = [...settings.permissions.allow, ...added]
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log(`[xtage] Granted ${added.length} permission(s) in .claude/settings.json`)
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function printInitDone(repoName: string, prog: ProgressState | null): void {
  const stats = (prog?.files && prog?.tokens)
    ? ` — ${prog.files} files · ${(prog.tokens / 1000).toFixed(1)}k tokens`
    : ''
  console.log(`\n✓ Indexed${stats}\n`)
  console.log(`  Claude now has persistent semantic knowledge of ${repoName}.`)
  console.log(`  Index saved to ~/xtage/${repoName}/\n`)
  console.log(`  xtage start    load context at session start`)
  console.log(`  xtage end      save session learnings`)
  console.log(`  xtage update   refresh after commits`)
  console.log(`  xtage status   check index freshness\n`)
}

async function runClaude(prompt: string): Promise<ProgressState | null> {
  const progressFile = makeProgressFile()
  const env = { ...process.env, XTAGE_PROGRESS_FILE: progressFile }
  const isTTY = process.stdout.isTTY

  const child = spawn(
    'claude',
    [
      '-p', prompt,
      '--mcp-config', xtageMcpConfig(import.meta.url),
      '--allowedTools', XTAGE_TOOLS.join(','),
    ],
    { stdio: ['inherit', 'pipe', 'pipe'], env }
  )

  let frame = 0
  let lastProgress: ProgressState | null = null

  const ticker = isTTY ? setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const prog = readProgress(progressFile)
    if (prog) lastProgress = prog

    let detail = ''
    if (prog?.phase === 'chunking' && prog.files) {
      const tk = prog.tokens ? ` · ${(prog.tokens / 1000).toFixed(1)}k tokens` : ''
      detail = `${prog.files} files${tk}`
    } else if (prog?.phase === 'writing' && prog.label) {
      detail = `writing ${prog.label}`
    }

    const icon = SPINNER[frame++ % SPINNER.length]
    const line = detail ? `  ${icon}  ${detail}  [${elapsed}s]` : `  ${icon}  [${elapsed}s]`
    process.stdout.write(`\r${line}\x1b[K`)
  }, 80) : null

  const start = Date.now()

  const code = await new Promise<number | null>(resolve => child.on('close', resolve))

  if (ticker) {
    clearInterval(ticker)
    process.stdout.write('\r\x1b[K')
  }

  const finalProgress = readProgress(progressFile) ?? lastProgress
  removeProgress(progressFile)

  if (code !== 0) process.exit(code ?? 1)
  return finalProgress
}

function gitRemote(): string | null {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return null
  }
}

function repoNameFromUrl(url: string): string {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${url}`)
  return match[2].replace(/\.git$/, '')
}

function detectRepoName(): string | null {
  const registered = lookupRepo(process.cwd())
  if (registered) return registered
  const remote = gitRemote()
  if (remote) {
    try { return repoNameFromUrl(remote) } catch { /* ignore */ }
  }
  return null
}

const args = process.argv.slice(2)
const cmd = args[0]

if (cmd === '-h' || cmd === '--help') {
  console.log(HELP)
  process.exit(0)
}

if (cmd === '-v' || cmd === '--version') {
  console.log(VERSION)
  process.exit(0)
}

if (!cmd || cmd === 'serve') {
  // Default: start MCP server (required for Claude Code MCP integration)
  const { startServer } = await import('./server.js')
  await startServer()

} else if (cmd === 'init') {
  const explicitUrl = args[1]
  await promptTelemetryOptIn()
  ensureXtagePermissions()
  if (explicitUrl) {
    const repoName = repoNameFromUrl(explicitUrl)
    console.log(`Fetching remote: ${explicitUrl}`)
    const prog = await runClaude(buildRepoInitPrompt({ repo_url: explicitUrl, repo_name: repoName }))
    exitUnlessIndexed(repoName)
    printInitDone(repoName, prog)
  } else {
    const localPath = process.cwd()
    const remote = gitRemote()
    const repoName = remote ? repoNameFromUrl(remote) : (localPath.split('/').filter(Boolean).pop() ?? 'repo')
    registerRepo(localPath, repoName)
    console.log(`Indexing: ${localPath}`)
    const prog = await runClaude(buildRepoInitPrompt({ local_path: localPath, repo_name: repoName }))
    exitUnlessIndexed(repoName)
    printInitDone(repoName, prog)

    // Auto-install so `xtage init` alone is a complete, working setup — a
    // real user shouldn't need to separately remember `xtage install`.
    // Skip only if hooks already exist (don't silently flip an explicit
    // --no-gate choice back on during a re-index).
    if (!existsSync(join(localPath, '.claude', 'settings.local.json'))) {
      runInstall(repoName, localPath, fileURLToPath(import.meta.url), { noGate: false })
    }
  }

} else if (cmd === 'update') {
  let repoUrl = args[1]
  let repoName: string
  if (!repoUrl) {
    repoUrl = gitRemote() ?? ''
    if (!repoUrl) {
      // Local-only repo: fall back to registry lookup
      const localName = detectRepoName()
      if (!localName) {
        console.error('No repo URL provided and no git remote detected. Run `xtage link` first.')
        process.exit(1)
      }
      repoName = localName
    } else {
      repoName = repoNameFromUrl(repoUrl)
    }
  } else {
    repoName = repoNameFromUrl(repoUrl)
  }
  await promptTelemetryOptIn()
  ensureXtagePermissions()
  const diff = getGitDiff()
  const { changedFiles, changedSymbols } = parseGitDiff(diff)
  const filesStr = changedFiles.join(', ') || '(none detected)'
  const symbolsStr = Array.from(changedSymbols.entries())
    .map(([f, syms]) => `${f}: ${syms.join(', ')}`)
    .join('; ')
  await runClaude(buildRepoUpdatePrompt({ repo_name: repoName, changed_files: filesStr, changed_symbols: symbolsStr || undefined }))

} else if (cmd === 'install') {
  const noGate = args.includes('--no-gate')
  const projectDir = process.cwd()
  const repoName = detectRepoName()
  if (!repoName) {
    console.error('Cannot detect repo. Run `xtage link` or `xtage init` first.')
    process.exit(1)
  }

  runInstall(repoName, projectDir, fileURLToPath(import.meta.url), { noGate })

} else if (cmd === 'uninstall') {
  const projectDir = process.cwd()
  const repoName = detectRepoName()
  if (!repoName) {
    console.error('Cannot detect repo. Run `xtage link` first.')
    process.exit(1)
  }

  const cliPath = fileURLToPath(import.meta.url)
  const settingsPath = join(projectDir, '.claude', 'settings.local.json')
  removeHooksFromSettings(settingsPath, repoName, cliPath)
  writeState(repoName, false)
  removeGitHook(projectDir)
  console.log(`[xtage] Uninstalled hooks for "${repoName}"`)

} else if (cmd === 'context') {
  const repoName = detectRepoName()
  if (!repoName) {
    process.stdout.write(JSON.stringify({ additionalContext: '' }) + '\n')
    process.exit(0)
  }

  try {
    const digest = buildContextDigest(repoName)
    process.stdout.write(JSON.stringify({ additionalContext: digest ?? '' }) + '\n')
  } catch {
    process.stdout.write(JSON.stringify({ additionalContext: '' }) + '\n')
  }
  process.exit(0)

} else if (cmd === 'sync-memory') {
  const fileIdx = args.indexOf('--file')
  const memFilePath = fileIdx !== -1 ? args[fileIdx + 1] : null
  if (!memFilePath) {
    console.error('Usage: xtage sync-memory --file <path>')
    process.exit(1)
  }

  const repoName = repoNameFromMemoryPath(memFilePath)
  if (!repoName) {
    process.exit(0) // not a registered repo, silently skip
  }

  const memDir = dirname(memFilePath)
  if (!existsSync(memDir)) process.exit(0)

  const files = readdirSync(memDir).filter((f: string) => f.endsWith('.md') && f !== 'MEMORY.md')
  if (files.length === 0) process.exit(0)

  const sections: string[] = []
  for (const f of files) {
    const content = readFile(join(memDir, f))
    if (!content) continue
    const name = readFrontmatter(content, 'name') ?? f.replace('.md', '')
    const type = readFrontmatter(content, 'type') ?? 'note'
    const body = stripFrontmatter(content).trim()
    sections.push(`### [${type}] ${name}\n\n${body}`)
  }

  if (sections.length === 0) process.exit(0)

  const existing = readFile(projectInsightsPath(repoName)) ?? ''
  const marker = '## Claude Memory (auto-synced)'
  const newSection = `${marker}\n\n${sections.join('\n\n---\n\n')}\n`
  const updated = existing.includes(marker)
    ? existing.replace(new RegExp(`${marker}[\\s\\S]*$`), newSection)
    : existing.trimEnd() + '\n\n' + newSection

  writeXtageFile(projectInsightsPath(repoName), updated)
  process.exit(0)

} else if (cmd === 'start') {
  // deprecated: alias for install
  console.warn('[xtage] `xtage start` is deprecated — use `xtage install` to wire Claude Code hooks.')
  ensureXtagePermissions()
  const repoName = detectRepoName()
  await runClaude(buildSessionStartPrompt({ repo_name: repoName ?? undefined }))

} else if (cmd === 'end') {
  // deprecated: no-op
  console.warn('[xtage] `xtage end` is deprecated — session learnings are now managed via hooks.')

} else if (cmd === 'status') {
  const repoName = detectRepoName()
  if (!repoName) {
    console.error('Cannot detect repo. Run `xtage link` or `xtage init` first.')
    process.exit(1)
  }
  const content = readFile(codeIndexPath(repoName))
  if (!content) {
    console.log(`No index found for "${repoName}". Run \`xtage init\` to create one.`)
    process.exit(0)
  }
  const lastIndexed = readFrontmatter(content, 'last_indexed') ?? 'unknown'
  const repoUrl = readFrontmatter(content, 'repo_url')
  console.log(`Repo:         ${repoName}`)
  console.log(`Last indexed: ${lastIndexed}`)
  if (repoUrl && lastIndexed !== 'unknown') {
    try {
      const { checkForUpdates } = await import('./github.js')
      const { stale, commitsBehind } = await checkForUpdates(repoUrl, lastIndexed)
      console.log(`Status:       ${stale ? `${commitsBehind} commit(s) behind — run \`xtage update\`` : 'up to date'}`)
    } catch {
      console.log('Status:       (could not check — offline or private repo)')
    }
  }

} else if (cmd === 'link') {
  let repoUrl = args[1]
  if (!repoUrl) {
    repoUrl = gitRemote() ?? ''
    if (!repoUrl) {
      console.error('No repo URL provided and no git remote detected.')
      console.error('Usage: xtage link <repo-url>')
      process.exit(1)
    }
    console.log(`Using remote: ${repoUrl}`)
  }
  const repoName = repoNameFromUrl(repoUrl)
  registerRepo(process.cwd(), repoName)
  console.log(`Linked ${process.cwd()} → ${repoName}`)

} else {
  console.error(`Unknown command: ${cmd}\n`)
  console.error(HELP)
  process.exit(1)
}

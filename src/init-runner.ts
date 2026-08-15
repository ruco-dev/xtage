/**
 * Logic behind `xtage init`'s subprocess wiring, post-run verification, and
 * the hook install it now triggers automatically.
 * Split out from cli.ts (which runs top-level dispatch on import) so it's testable.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { codeIndexPath, readFile, repoDir } from './store.js'
import { emitHookScripts, mergeHooksIntoSettings, installGitHook, writeState } from './stagehand.js'

// The spawned `claude -p` subprocess is a fresh Claude Code session that does not
// inherit our MCP registrations. Point it at this same binary running `serve`, so
// the mcp__xtage__* tools referenced by --allowedTools actually exist for it to call.
export function xtageMcpConfig(entrypointUrl: string = import.meta.url): string {
  const entrypoint = fileURLToPath(entrypointUrl)
  return JSON.stringify({
    mcpServers: {
      xtage: { command: process.execPath, args: [entrypoint, 'serve'] },
    },
  })
}

export type IndexOutcome = 'indexed' | 'stopped-partway' | 'unreachable'

// Distinguish the failure modes behind a missing CODEINDEX.md. A bare "the agent
// didn't save it" sends the user into a retry loop even when retrying cannot help.
export function classifyIndexOutcome(repoName: string): IndexOutcome {
  if (existsSync(codeIndexPath(repoName))) return 'indexed'
  if (existsSync(join(repoDir(repoName), 'REPO.md'))) return 'stopped-partway'
  return 'unreachable'
}

export function exitUnlessIndexed(repoName: string): void {
  const outcome = classifyIndexOutcome(repoName)
  if (outcome === 'indexed') return

  console.error(`\n✗ Index was not written to ${codeIndexPath(repoName)}`)
  if (outcome === 'stopped-partway') {
    console.error('REPO.md was written, so the xtage MCP tools are reachable — the agent')
    console.error('stopped before saving CODEINDEX.md (often a timeout on a large repo).')
    console.error('Re-run `xtage init`; it resumes from the same chunks.')
  } else {
    console.error('No files were written at all, which usually means the indexing agent')
    console.error('could not reach the xtage MCP tools. Check that `claude` is on PATH and')
    console.error('that `xtage serve` starts cleanly, then re-run `xtage init`.')
  }
  process.exit(1)
}

// Wires the stagehand hooks (gate/flag/dirty/context + git post-commit) into
// this project's .claude/settings.local.json. Shared by the standalone
// `xtage install` command and by `xtage init`'s auto-install, so a first-time
// user gets a fully working setup — indexed AND enforced — from one command.
export function runInstall(repoName: string, projectDir: string, cliPath: string, opts: { noGate: boolean }): void {
  if (!readFile(codeIndexPath(repoName))) {
    console.warn(`[xtage] Warning: no CODEINDEX.md found for "${repoName}". Run \`xtage init\` to index the repo. Hooks will be installed but the gate will fail-open until an index exists.`)
  }

  const hookPaths = emitHookScripts(repoName, projectDir)

  const claudeDir = join(projectDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  const settingsPath = join(claudeDir, 'settings.local.json')
  mergeHooksIntoSettings(settingsPath, repoName, hookPaths, cliPath, !opts.noGate)
  writeState(repoName, true)

  const gitInstalled = installGitHook(projectDir)
  console.log(`[xtage] Installed hooks for "${repoName}" in ${settingsPath}`)
  if (!opts.noGate) console.log(`[xtage]   gate: Read|Grep|Glob → mcp__xtage__read_file_chunk`)
  console.log(`[xtage]   flag: read_file_chunk|read_codeindex → consulted.json`)
  console.log(`[xtage]   dirty: Edit|Write → dirty.json`)
  console.log(`[xtage]   context: SessionStart digest injection`)
  if (gitInstalled) console.log(`[xtage]   git post-commit hook → xtage update`)
}

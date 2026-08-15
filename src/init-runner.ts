/**
 * Logic behind `xtage init`'s subprocess wiring and post-run verification.
 * Split out from cli.ts (which runs top-level dispatch on import) so it's testable.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { codeIndexPath, repoDir } from './store.js'

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

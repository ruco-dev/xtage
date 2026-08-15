import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { xtageMcpConfig, classifyIndexOutcome } from '../init-runner.js'
import { updateFrontmatter, repoDir as xtageRepoDir } from '../store.js'

// ─── xtageMcpConfig ─────────────────────────────────────────────────────────
// Regression coverage for the bug where `xtage init` spawned a `claude -p`
// subprocess allow-listing mcp__xtage__* tools without ever registering the
// server, so the tools didn't exist for the subprocess to call.

describe('xtageMcpConfig', () => {
  it('registers an xtage MCP server that re-invokes this binary with `serve`', () => {
    const config = JSON.parse(xtageMcpConfig('file:///fake/path/to/cli.js'))
    expect(config.mcpServers.xtage.command).toBe(process.execPath)
    expect(config.mcpServers.xtage.args).toEqual(['/fake/path/to/cli.js', 'serve'])
  })

  it('resolves the entrypoint from the given import.meta.url, not a hardcoded path', () => {
    const config = JSON.parse(xtageMcpConfig('file:///other/dist/cli.js'))
    expect(config.mcpServers.xtage.args[0]).toBe('/other/dist/cli.js')
  })
})

// ─── classifyIndexOutcome ───────────────────────────────────────────────────
// Distinguishes "MCP tools unreachable" (no files at all) from "stopped
// partway" (REPO.md written, CODEINDEX.md missing) from a clean success —
// so the CLI can point at the actual cause instead of a blanket retry.

describe('classifyIndexOutcome', () => {
  // store.ts resolves XTAGE_HOME from os.homedir() at module-load time, so it
  // can't be redirected via process.env.HOME from a test. Use a throwaway repo
  // name under the real ~/xtage/ instead, and clean up after each case.
  let repoName: string

  beforeEach(() => {
    repoName = `__test-classify-${Date.now()}-${Math.random().toString(36).slice(2)}`
  })

  afterEach(() => {
    rmSync(xtageRepoDir(repoName), { recursive: true, force: true })
  })

  it('reports "unreachable" when neither REPO.md nor CODEINDEX.md exist', () => {
    expect(classifyIndexOutcome(repoName)).toBe('unreachable')
  })

  it('reports "stopped-partway" when REPO.md exists but CODEINDEX.md does not', () => {
    mkdirSync(xtageRepoDir(repoName), { recursive: true })
    writeFileSync(join(xtageRepoDir(repoName), 'REPO.md'), '# repo')
    expect(classifyIndexOutcome(repoName)).toBe('stopped-partway')
  })

  it('reports "indexed" once CODEINDEX.md exists', () => {
    mkdirSync(xtageRepoDir(repoName), { recursive: true })
    writeFileSync(join(xtageRepoDir(repoName), 'REPO.md'), '# repo')
    writeFileSync(join(xtageRepoDir(repoName), 'CODEINDEX.md'), '---\nlast_indexed: x\n---\n')
    expect(classifyIndexOutcome(repoName)).toBe('indexed')
  })
})

// ─── last_indexed stamping ──────────────────────────────────────────────────
// The write_codeindex handler stamps last_indexed at actual write time via
// updateFrontmatter, replacing whatever the agent put in the prompt-built
// draft (which goes stale by the full run duration on long indexes).

describe('last_indexed stamping (updateFrontmatter)', () => {
  it('overwrites a stale placeholder with the real write time', () => {
    const content = '---\nrepo_url: /test\nlast_indexed: 2020-01-01T00:00:00.000Z\ntool_version: 0.1.0\n---\n\n## `a.js`\n'
    const now = '2026-08-15T14:30:00.000Z'
    const stamped = updateFrontmatter(content, 'last_indexed', now)

    expect(stamped).toContain(`last_indexed: ${now}`)
    expect(stamped).not.toContain('2020-01-01')
  })

  it('preserves all other content character-for-character', () => {
    const content = '---\nrepo_url: /test\nlast_indexed: 2020-01-01T00:00:00.000Z\ntool_version: 0.1.0\n---\n\n## `a.js`\n\n**Role:** does a thing.\n'
    const stamped = updateFrontmatter(content, 'last_indexed', '2026-08-15T14:30:00.000Z')
    const withoutTimestampLine = (s: string) => s.split('\n').filter(l => !l.startsWith('last_indexed:')).join('\n')

    expect(withoutTimestampLine(stamped)).toBe(withoutTimestampLine(content))
  })

  it('is a no-op when last_indexed is absent (does not fabricate the field)', () => {
    const content = '---\nrepo_url: /test\ntool_version: 0.1.0\n---\n\n## `a.js`\n'
    const stamped = updateFrontmatter(content, 'last_indexed', '2026-08-15T14:30:00.000Z')

    expect(stamped).toBe(content)
  })
})

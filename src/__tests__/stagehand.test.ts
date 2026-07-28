import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import {
  generateGateMjs,
  generateFlagMjs,
  generateClearMjs,
  mergeHooksIntoSettings,
  removeHooksFromSettings,
  buildContextDigest,
} from '../stagehand.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'xtage-test-'))
}

/** Run a generated .mjs script with given stdin and a fake HOME. */
function runScript(
  scriptContent: string,
  stdinJson: object,
  fakeHome: string,
): { exitCode: number; stderr: string; stdout: string } {
  const dir = makeTmpDir()
  const scriptPath = join(dir, 'script.mjs')
  writeFileSync(scriptPath, scriptContent)

  const result = spawnSync('node', [scriptPath], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    env: { ...process.env, HOME: fakeHome },
  })

  return {
    exitCode: result.status ?? -1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

/** Set up a fake xtage home with state, consulted, dirty, and optional chunk. */
function setupFakeHome(
  fakeHome: string,
  repoName: string,
  opts: {
    enabled?: boolean
    consulted?: Record<string, string>
    dirty?: Record<string, string>
    chunks?: string[] // slug names to create
  } = {},
): void {
  const repoDir = join(fakeHome, 'xtage', repoName)
  const sessionDir = join(repoDir, 'session')
  const chunksDir = join(repoDir, 'files')
  mkdirSync(sessionDir, { recursive: true })
  mkdirSync(chunksDir, { recursive: true })

  const enabled = opts.enabled ?? true
  writeFileSync(join(repoDir, 'state.json'), JSON.stringify({ enabled }))

  if (opts.consulted) {
    writeFileSync(join(sessionDir, 'consulted.json'), JSON.stringify(opts.consulted))
  }
  if (opts.dirty) {
    writeFileSync(join(sessionDir, 'dirty.json'), JSON.stringify(opts.dirty))
  }
  if (opts.chunks) {
    for (const slug of opts.chunks) {
      writeFileSync(join(chunksDir, slug), `---\noriginal_tokens: 500\n---\n\nSummary content.`)
    }
  }
}

// ─── Gate decision table ─────────────────────────────────────────────────────

describe('gate.mjs decision table', () => {
  const REPO = 'test-repo'
  const PROJECT_ROOT = '/fake/project'

  it('passes: xtage MCP tool — always exit 0', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO)
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'mcp__xtage__read_file_chunk' }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes (fail-open): state.json missing', () => {
    const fakeHome = makeTmpDir() // no state.json
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes (fail-open): enabled=false', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO, { enabled: false })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes (fail-open): no chunk for file', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO) // no chunks
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes: chunk exists but already consulted', () => {
    const fakeHome = makeTmpDir()
    const slug = 'src-foo.ts.md'
    setupFakeHome(fakeHome, REPO, {
      chunks: [slug],
      consulted: { [slug]: '2026-01-01T00:00:00.000Z' },
    })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes: chunk exists but marked dirty', () => {
    const fakeHome = makeTmpDir()
    const slug = 'src-foo.ts.md'
    setupFakeHome(fakeHome, REPO, {
      chunks: [slug],
      dirty: { [slug]: '2026-01-01T00:00:00.000Z' },
    })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('denies: chunk exists, fresh, not consulted → exit 1 with steering', () => {
    const fakeHome = makeTmpDir()
    const slug = 'src-foo.ts.md'
    setupFakeHome(fakeHome, REPO, { chunks: [slug] })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/foo.ts` } }, fakeHome)
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('mcp__xtage__read_file_chunk')
    expect(r.stderr).toContain(slug)
    expect(r.stderr).toContain('500 tokens')
  })

  it('denies: Grep before CODEINDEX consulted → exit 1', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO)
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Grep', tool_input: { pattern: 'foo' } }, fakeHome)
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('mcp__xtage__read_codeindex')
  })

  it('passes: Grep after CODEINDEX consulted', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO, { consulted: { _codeindex: '2026-01-01T00:00:00.000Z' } })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Grep', tool_input: { pattern: 'foo' } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes: file path outside project root', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO, { chunks: ['src-foo.ts.md'] })
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Read', tool_input: { file_path: '/other/project/src/foo.ts' } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })

  it('passes: unrecognized tool', () => {
    const fakeHome = makeTmpDir()
    setupFakeHome(fakeHome, REPO)
    const script = generateGateMjs(REPO, PROJECT_ROOT)
    const r = runScript(script, { tool_name: 'Bash', tool_input: { command: 'ls' } }, fakeHome)
    expect(r.exitCode).toBe(0)
  })
})

// ─── Idempotent install ──────────────────────────────────────────────────────

describe('mergeHooksIntoSettings idempotency', () => {
  it('running merge twice produces no duplicate entries', () => {
    const dir = makeTmpDir()
    const settingsPath = join(dir, 'settings.local.json')
    const repoName = 'my-repo'
    const hookPaths = {
      gate: `/fake/xtage/${repoName}/hooks/gate.mjs`,
      flag: `/fake/xtage/${repoName}/hooks/flag.mjs`,
      clear: `/fake/xtage/${repoName}/hooks/clear.mjs`,
      dirty: `/fake/xtage/${repoName}/hooks/dirty.mjs`,
    }
    const cliPath = '/fake/dist/cli.js'

    mergeHooksIntoSettings(settingsPath, repoName, hookPaths, cliPath, true)
    mergeHooksIntoSettings(settingsPath, repoName, hookPaths, cliPath, true)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))

    // Exactly 2 SessionStart entries (clear + context)
    expect(settings.hooks.SessionStart).toHaveLength(2)
    // Exactly 1 PreToolUse entry
    expect(settings.hooks.PreToolUse).toHaveLength(1)
    // Exactly 2 PostToolUse entries (flag + dirty)
    expect(settings.hooks.PostToolUse).toHaveLength(2)
  })

  it('removeHooksFromSettings cleans all xtage entries', () => {
    const dir = makeTmpDir()
    const settingsPath = join(dir, 'settings.local.json')
    const hookPaths = {
      gate: '/fake/xtage/my-repo/hooks/gate.mjs',
      flag: '/fake/xtage/my-repo/hooks/flag.mjs',
      clear: '/fake/xtage/my-repo/hooks/clear.mjs',
      dirty: '/fake/xtage/my-repo/hooks/dirty.mjs',
    }
    const cliPath = '/fake/dist/cli.js'
    const repoName = 'my-repo'

    mergeHooksIntoSettings(settingsPath, repoName, hookPaths, cliPath)
    removeHooksFromSettings(settingsPath, repoName, cliPath)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks?.SessionStart ?? []).toHaveLength(0)
    expect(settings.hooks?.PreToolUse ?? []).toHaveLength(0)
    expect(settings.hooks?.PostToolUse ?? []).toHaveLength(0)
  })

  it('preserves pre-existing non-xtage hook entries', () => {
    const dir = makeTmpDir()
    const settingsPath = join(dir, 'settings.local.json')

    // Pre-existing hook from another tool
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hello' }] }],
      },
    }, null, 2))

    mergeHooksIntoSettings(settingsPath, 'my-repo', {
      gate: '/fake/xtage/my-repo/hooks/gate.mjs',
      flag: '/fake/xtage/my-repo/hooks/flag.mjs',
      clear: '/fake/xtage/my-repo/hooks/clear.mjs',
      dirty: '/fake/xtage/my-repo/hooks/dirty.mjs',
    }, '/fake/cli.js')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks.PreToolUse).toHaveLength(2)
    expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash')
  })
})

// ─── Integration: deny → chunk → pass flow ───────────────────────────────────

describe('integration: deny → flag → pass', () => {
  it('Read is denied, then passes after flag writes consulted entry', () => {
    const fakeHome = makeTmpDir()
    const REPO = 'int-repo'
    const PROJECT_ROOT = '/fake/project'
    const slug = 'src-app.ts.md'

    setupFakeHome(fakeHome, REPO, { chunks: [slug] })

    const gateScript = generateGateMjs(REPO, PROJECT_ROOT)
    const flagScript = generateFlagMjs(REPO)

    const readInput = { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/app.ts` } }

    // First Read → denied
    const r1 = runScript(gateScript, readInput, fakeHome)
    expect(r1.exitCode).toBe(1)

    // Flag: simulate read_file_chunk completed
    const flagInput = { tool_name: 'mcp__xtage__read_file_chunk', tool_input: { filename: slug } }
    const rf = runScript(flagScript, flagInput, fakeHome)
    expect(rf.exitCode).toBe(0)

    // Second Read → passes
    const r2 = runScript(gateScript, readInput, fakeHome)
    expect(r2.exitCode).toBe(0)
  })

  it('session clear resets consulted flags', () => {
    const fakeHome = makeTmpDir()
    const REPO = 'int-repo'
    const PROJECT_ROOT = '/fake/project'
    const slug = 'src-app.ts.md'

    // Start with chunk consulted
    setupFakeHome(fakeHome, REPO, {
      chunks: [slug],
      consulted: { [slug]: '2026-01-01T00:00:00.000Z' },
    })

    const gateScript = generateGateMjs(REPO, PROJECT_ROOT)
    const clearScript = generateClearMjs(REPO)
    const readInput = { tool_name: 'Read', tool_input: { file_path: `${PROJECT_ROOT}/src/app.ts` } }

    // Before clear: passes (already consulted)
    expect(runScript(gateScript, readInput, fakeHome).exitCode).toBe(0)

    // Clear session
    runScript(clearScript, {}, fakeHome)

    // After clear: denied again
    expect(runScript(gateScript, readInput, fakeHome).exitCode).toBe(1)
  })
})

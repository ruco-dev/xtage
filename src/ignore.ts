/**
 * Ignore chain: .gitignore rules + .xtage-ignore + default patterns.
 * Secretlint scanning via CLI subprocess.
 */
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as os from 'os'
import _ignore from 'ignore'
import type { Ignore } from 'ignore'

const ignore = _ignore.default || _ignore
// Files/patterns always excluded regardless of user config
const DEFAULT_IGNORE = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'secrets/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.min.js',
  '*.min.css',
  '*.map',
]

// File extensions we care about indexing
const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.java', '.rb', '.rs', '.cpp', '.c', '.cs', '.php',
  '.md', '.rst', '.txt',
  '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh',
  '.html', '.css', '.scss',
  '.sql',
])

function buildIgnoreFilter(extraRules: string[] = []): Ignore {
  const ig = ignore()
  ig.add(DEFAULT_IGNORE)
  ig.add(extraRules)
  return ig
}

export function loadIgnoreRules(projectDir?: string): Ignore {
  const rules: string[] = []

  if (projectDir) {
    const gitignorePath = join(projectDir, '.gitignore')
    if (existsSync(gitignorePath)) {
      rules.push(...readFileSync(gitignorePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')))
    }

    const xtageIgnorePath = join(projectDir, '.xtage-ignore')
    if (existsSync(xtageIgnorePath)) {
      rules.push(...readFileSync(xtageIgnorePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')))
    }
  }

  return buildIgnoreFilter(rules)
}

export function makeFilter(ig: Ignore): (path: string) => boolean {
  return (path: string) => {
    // Must have an indexable extension
    const dot = path.lastIndexOf('.')
    if (dot < 0) return false
    const ext = path.slice(dot).toLowerCase()
    if (!INDEXABLE_EXTENSIONS.has(ext)) return false

    // Must not be ignored
    try {
      return !ig.ignores(path)
    } catch {
      return false
    }
  }
}

export interface SecretScanResult {
  clean: boolean
  warnings: string[]
}

/**
 * Scan a file's content for secrets using secretlint CLI.
 * Falls back to clean if secretlint is not installed.
 */
export function scanForSecrets(_path: string, content: string): SecretScanResult {
  const tmpDir = os.tmpdir()
  const tmpFile = join(tmpDir, `xtage-scan-${Date.now()}.tmp`)

  try {
    writeFileSync(tmpFile, content, 'utf8')

    try {
      execSync(`npx --yes secretlint --format json "${tmpFile}"`, {
        stdio: 'pipe',
        timeout: 10_000,
      })
      return { clean: true, warnings: [] }
    } catch (err: unknown) {
      // secretlint exits non-zero when it finds issues
      const output = (err as { stdout?: Buffer }).stdout?.toString() ?? ''
      try {
        const parsed = JSON.parse(output) as { results: Array<{ messages: Array<{ message: string }> }> }
        const warnings = parsed.results.flatMap(r => r.messages.map(m => m.message))
        return { clean: warnings.length === 0, warnings }
      } catch {
        return { clean: true, warnings: [] }
      }
    }
  } finally {
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

/**
 * Read/write the four persistent files in ~/xtage/.
 * All paths are resolved relative to the xtage home directory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as os from 'os'

export const XTAGE_HOME = join(os.homedir(), 'xtage')

export function repoDir(repoName: string): string {
  return join(XTAGE_HOME, repoName)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function readFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf8')
}

export function writeXtageFile(filePath: string, content: string): void {
  ensureDir(join(filePath, '..'))
  writeFileSync(filePath, content, 'utf8')
}

// Paths
export function repoMdPath(repoName: string): string {
  return join(repoDir(repoName), 'REPO.md')
}
export function codeIndexPath(repoName: string): string {
  return join(repoDir(repoName), 'CODEINDEX.md')
}
export function projectInsightsPath(repoName: string): string {
  return join(repoDir(repoName), 'PROJECTINSIGHTS.md')
}
export function generalInsightsPath(): string {
  return join(XTAGE_HOME, 'GENERALINSIGHTS.md')
}
export function fileChunkPath(repoName: string, filename: string): string {
  return join(repoDir(repoName), 'files', filename)
}

// ─── Stagehand hook state paths ────────────────────────────────────────────

export function statePath(repoName: string): string {
  return join(repoDir(repoName), 'state.json')
}

export function sessionDir(repoName: string): string {
  return join(repoDir(repoName), 'session')
}

export function consultedPath(repoName: string): string {
  return join(sessionDir(repoName), 'consulted.json')
}

export function dirtyPath(repoName: string): string {
  return join(sessionDir(repoName), 'dirty.json')
}

export function repoHooksDir(repoName: string): string {
  return join(repoDir(repoName), 'hooks')
}

// ─── Memory / project paths ────────────────────────────────────────────────

export function claudeMemoryDir(localPath: string): string {
  const sanitized = localPath.replace(/\//g, '-')
  return join(os.homedir(), '.claude', 'projects', sanitized, 'memory')
}

export function repoNameFromMemoryPath(memoryFilePath: string): string | null {
  const match = memoryFilePath.match(/\.claude[/\\]projects[/\\]([^/\\]+)[/\\]memory[/\\]/)
  if (!match) return null
  const projectKey = match[1] // e.g. -Users-ruco-projects-sitegrow
  const registry = readRegistry()
  for (const [localPath, repoName] of Object.entries(registry)) {
    if (localPath.replace(/\//g, '-') === projectKey) return repoName
  }
  return null
}

// Registry: maps local absolute paths → repo names
const REGISTRY_PATH = join(XTAGE_HOME, 'registry.json')

type Registry = Record<string, string>

function readRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return {}
  try { return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) } catch { return {} }
}

export function registerRepo(localPath: string, repoName: string): void {
  const registry = readRegistry()
  registry[localPath] = repoName
  ensureDir(XTAGE_HOME)
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8')
}

export function lookupRepo(localPath: string): string | null {
  const registry = readRegistry()
  return registry[localPath] ?? null
}

export function listRegistry(): Registry {
  return readRegistry()
}

/**
 * Extract a frontmatter field from a markdown file.
 * Returns null if field not found.
 */
export function readFrontmatter(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

/**
 * Strip the YAML frontmatter block (---\n...\n---\n) from markdown content.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) return content
  return content.slice(end + 5).replace(/^\n/, '')
}

/**
 * Update a frontmatter field in-place within markdown content.
 */
export function updateFrontmatter(content: string, field: string, value: string): string {
  const re = new RegExp(`^(${field}:\\s*)(.+)$`, 'm')
  if (re.test(content)) {
    return content.replace(re, `$1${value}`)
  }
  return content
}

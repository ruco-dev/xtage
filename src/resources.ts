/**
 * MCP resource definitions — serve the four xtage files via xtage:// URIs.
 * The active repo_name is resolved from env XTAGE_REPO or the first indexed repo.
 */
import type { McpsterServer } from "@ruco-ai/mcpster"
import {
  readFile,
  repoMdPath, codeIndexPath, projectInsightsPath, generalInsightsPath,
  XTAGE_HOME, lookupRepo,
} from './store.js'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'

function resolveRepoName(): string {
  if (process.env.XTAGE_REPO) return process.env.XTAGE_REPO

  // Registry lookup by cwd
  const fromRegistry = lookupRepo(process.cwd())
  if (fromRegistry) return fromRegistry

  // Fallback: first directory in ~/xtage/ that has CODEINDEX.md
  if (existsSync(XTAGE_HOME)) {
    const dirs = readdirSync(XTAGE_HOME, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    for (const dir of dirs) {
      if (existsSync(join(XTAGE_HOME, dir, 'CODEINDEX.md'))) return dir
    }
  }

  return 'unknown'
}

function readOrMissing(path: string, label: string): string {
  const content = readFile(path)
  if (!content) return `No ${label} found. Run: npx @ruco-dev/xtage init <repo-url>`
  return content
}

export function registerResources(server: McpsterServer): void {

  server.defineResource({
    uri: 'xtage://repo',
    description: 'REPO.md — repository overview, architecture, key patterns. Read at session start.',
    resolver: async () => {
      const repoName = resolveRepoName()
      return readOrMissing(repoMdPath(repoName), 'REPO.md')
    },
  })

  server.defineResource({
    uri: 'xtage://index',
    description: 'CODEINDEX.md — semantic per-file index of the codebase. Read at session start.',
    resolver: async () => {
      const repoName = resolveRepoName()
      return readOrMissing(codeIndexPath(repoName), 'CODEINDEX.md')
    },
  })

  server.defineResource({
    uri: 'xtage://project-insights',
    description: 'PROJECTINSIGHTS.md — accumulated project-specific knowledge. Read at session start.',
    resolver: async () => {
      const repoName = resolveRepoName()
      return readOrMissing(projectInsightsPath(repoName), 'PROJECTINSIGHTS.md')
    },
  })

  server.defineResource({
    uri: 'xtage://general-insights',
    description: 'GENERALINSIGHTS.md — transferable patterns across all repos. Read at session start.',
    resolver: async () => {
      return readOrMissing(generalInsightsPath(), 'GENERALINSIGHTS.md')
    },
  })
}

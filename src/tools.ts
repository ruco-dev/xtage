/**
 * All MCP tool definitions for xtage.
 */
import { z } from 'zod'
import type { McpsterServer } from "mcpster"
import { fetchRepoData, fetchSingleFile, checkForUpdates } from './github.js'
import { fetchLocalRepoData } from './local.js'
import { loadIgnoreRules, makeFilter, scanForSecrets } from './ignore.js'
import { chunkFiles } from './chunker.js'
import { countTokensLocal } from './tokens.js'
import { trackGeneralInsightsWrite, trackError } from './telemetry.js'
import { writeProgress } from './progress.js'
import { logChunkedRead, logRawRead, getSessionStats } from './sessions.js'
import {
  writeXtageFile, readFile,
  repoMdPath, codeIndexPath, projectInsightsPath, generalInsightsPath, fileChunkPath,
  registerRepo, lookupRepo, listRegistry,
  readFrontmatter, stripFrontmatter,
  repoNameFromMemoryPath,
} from './store.js'

export function registerTools(server: McpsterServer): void {

  server.defineTool({
    name: 'fetch_repo_data',
    description: 'Fetch files from a public GitHub repository, returned in token-sized chunks. Call repeatedly with incrementing chunk_index until has_more is false.',
    schema: z.object({
      url: z.string().describe('GitHub repository URL (public)'),
      chunk_index: z.number().int().min(1).default(1).describe('Which chunk to return (1-based). Start at 1, increment until has_more is false.'),
    }),
    handler: async ({ url, chunk_index }) => {
      const ig = loadIgnoreRules()
      const filter = makeFilter(ig)

      const { meta, files } = await fetchRepoData(url, filter)

      // Secretlint scan — warn but don't block
      const secret_warnings: string[] = []
      for (const f of files) {
        const scan = scanForSecrets(f.path, f.content)
        if (!scan.clean) {
          secret_warnings.push(...scan.warnings.map(w => `${f.path}: ${w}`))
        }
      }
      for (const w of secret_warnings) {
        console.warn(`[xtage] Potential secret warning — ${w}`)
      }

      const chunks = chunkFiles(files, 8000, countTokensLocal)
      const chunk = chunks[chunk_index - 1]

      writeProgress({ phase: 'chunking', files: files.length, tokens: files.reduce((s, f) => s + f.tokens, 0), chunks: chunks.length })

      if (!chunk) {
        return { meta, files: [], chunk_index, chunk_total: chunks.length, has_more: false, secret_warnings }
      }

      return {
        meta,
        files: chunk.files,
        chunk_index,
        chunk_total: chunks.length,
        has_more: chunk_index < chunks.length,
        secret_warnings,
      }
    },
  })

  server.defineTool({
    name: 'fetch_local_repo_data',
    description: 'Fetch files from a local repository on disk, returned in token-sized chunks. Call repeatedly with incrementing chunk_index until has_more is false.',
    schema: z.object({
      local_path: z.string().describe('Absolute path to the repository root on disk'),
      chunk_index: z.number().int().min(1).default(1).describe('Which chunk to return (1-based). Start at 1, increment until has_more is false.'),
    }),
    handler: async ({ local_path, chunk_index }) => {
      const ig = loadIgnoreRules(local_path)
      const filter = makeFilter(ig)
      const files = fetchLocalRepoData(local_path, filter)

      const secret_warnings: string[] = []
      for (const f of files) {
        const scan = scanForSecrets(f.path, f.content)
        if (!scan.clean) {
          secret_warnings.push(...scan.warnings.map(w => `${f.path}: ${w}`))
        }
      }
      for (const w of secret_warnings) {
        console.warn(`[xtage] Potential secret warning — ${w}`)
      }

      const chunks = chunkFiles(files, 8000, countTokensLocal)
      const chunk = chunks[chunk_index - 1]

      writeProgress({ phase: 'chunking', files: files.length, tokens: files.reduce((s, f) => s + f.tokens, 0), chunks: chunks.length })

      if (!chunk) {
        return { local_path, files: [], chunk_index, chunk_total: chunks.length, has_more: false, secret_warnings }
      }

      return {
        local_path,
        files: chunk.files,
        chunk_index,
        chunk_total: chunks.length,
        has_more: chunk_index < chunks.length,
        secret_warnings,
      }
    },
  })

  server.defineTool({
    name: 'get_file',
    description: 'Fetch a single file from a GitHub repository. Use when diff alone is insufficient to understand a change.',
    schema: z.object({
      path: z.string().describe('File path within the repository'),
      repo_url: z.string().describe('GitHub repository URL'),
      repo_name: z.string().optional().describe('Repo name for session token tracking (optional)'),
    }),
    handler: async ({ path, repo_url, repo_name }) => {
      const file = await fetchSingleFile(repo_url, path)
      if (repo_name) logRawRead(repo_name, path, file.tokens)
      return file
    },
  })

  server.defineTool({
    name: 'write_repo_md',
    description: 'Write REPO.md to ~/xtage/{repo-name}/REPO.md',
    schema: z.object({
      content: z.string().describe('Full markdown content for REPO.md'),
      repo_name: z.string().describe('Repository name (used as directory name)'),
    }),
    handler: async ({ content, repo_name }) => {
      writeXtageFile(repoMdPath(repo_name), content)
      writeProgress({ phase: 'writing', label: 'REPO.md' })
      return { written: repoMdPath(repo_name) }
    },
  })

  server.defineTool({
    name: 'write_codeindex',
    description: 'Write CODEINDEX.md to ~/xtage/{repo-name}/CODEINDEX.md',
    schema: z.object({
      content: z.string().describe('Full markdown content for CODEINDEX.md'),
      repo_name: z.string().describe('Repository name'),
    }),
    handler: async ({ content, repo_name }) => {
      writeXtageFile(codeIndexPath(repo_name), content)
      writeProgress({ phase: 'writing', label: 'CODEINDEX.md' })
      return { written: codeIndexPath(repo_name) }
    },
  })

  server.defineTool({
    name: 'write_project_insights',
    description: 'Write or update PROJECTINSIGHTS.md for this repository',
    schema: z.object({
      content: z.string().describe('Full markdown content for PROJECTINSIGHTS.md'),
      repo_name: z.string().describe('Repository name'),
    }),
    handler: async ({ content, repo_name }) => {
      writeXtageFile(projectInsightsPath(repo_name), content)
      return { written: projectInsightsPath(repo_name) }
    },
  })

  server.defineTool({
    name: 'write_general_insights',
    description: 'Write or update GENERALINSIGHTS.md (global, cross-repo)',
    schema: z.object({
      content: z.string().describe('Full markdown content for GENERALINSIGHTS.md'),
    }),
    handler: async ({ content }) => {
      try {
        writeXtageFile(generalInsightsPath(), content)
        trackGeneralInsightsWrite(content)
        return { written: generalInsightsPath() }
      } catch (err) {
        trackError(err instanceof Error ? err.message : String(err), 'write_general_insights')
        throw err
      }
    },
  })

  server.defineTool({
    name: 'read_codeindex',
    description: 'Read CODEINDEX.md for a repository. Call this before opening any source files.',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
    }),
    handler: async ({ repo_name }) => {
      const content = readFile(codeIndexPath(repo_name))
      if (!content) return { content: null, note: 'No CODEINDEX.md found. Run: index this repo with xtage' }
      return { content }
    },
  })

  server.defineTool({
    name: 'read_repo_md',
    description: 'Read REPO.md for a repository (architecture, workflow, stack overview).',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
    }),
    handler: async ({ repo_name }) => {
      const content = readFile(repoMdPath(repo_name))
      if (!content) return { content: null, note: 'No REPO.md found.' }
      return { content }
    },
  })

  server.defineTool({
    name: 'read_project_insights',
    description: 'Read PROJECTINSIGHTS.md for a repository (design decisions, known gaps).',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
    }),
    handler: async ({ repo_name }) => {
      const content = readFile(projectInsightsPath(repo_name))
      if (!content) return { content: null, note: 'No PROJECTINSIGHTS.md found.' }
      return { content }
    },
  })

  server.defineTool({
    name: 'read_file_chunk',
    description: 'Read a per-file compressed summary from ~/xtage/{repo}/files/{filename}.md. Call this before opening the actual source file.',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
      filename: z.string().describe('Chunk filename (e.g. "src-index.ts.md")'),
    }),
    handler: async ({ repo_name, filename }) => {
      const raw = readFile(fileChunkPath(repo_name, filename))
      if (!raw) return { content: null, note: `No chunk found for ${filename}. Write one with write_file_chunk.` }

      const originalTokStr = readFrontmatter(raw, 'original_tokens')
      const original_tokens = originalTokStr ? parseInt(originalTokStr, 10) : null
      const content = stripFrontmatter(raw)
      const summary_tokens = countTokensLocal(content)

      logChunkedRead(repo_name, filename, summary_tokens, original_tokens)

      return {
        content,
        ...(original_tokens !== null ? { original_tokens, summary_tokens } : {}),
      }
    },
  })

  server.defineTool({
    name: 'list_file_chunks',
    description: 'List all per-file chunk summaries available for a repository, with their tags and original token counts.',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
      tag: z.string().optional().describe('Filter to chunks with this tag'),
    }),
    handler: async ({ repo_name, tag }) => {
      const { readdirSync, existsSync } = await import('fs')
      const dir = fileChunkPath(repo_name, '').replace(/[/\\]$/, '')
      if (!existsSync(dir)) return { chunks: [], note: 'No file chunks indexed yet.' }

      const files = readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith('.original.md'))
      const chunks = files.map(f => {
        const raw = readFile(fileChunkPath(repo_name, f)) ?? ''
        const tagsStr = readFrontmatter(raw, 'tags')
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []
        const origStr = readFrontmatter(raw, 'original_tokens')
        return {
          filename: f,
          tags,
          original_tokens: origStr ? parseInt(origStr, 10) : null,
        }
      })

      const result = tag ? chunks.filter(c => c.tags.includes(tag)) : chunks
      return { chunks: result }
    },
  })

  server.defineTool({
    name: 'register_repo',
    description: 'Register a local repository path → repo name mapping so xtage can resolve which indexed repo corresponds to the current working directory.',
    schema: z.object({
      local_path: z.string().describe('Absolute local path to the repository root'),
      repo_name: z.string().describe('Repo name as used in ~/xtage/{repo-name}/'),
    }),
    handler: async ({ local_path, repo_name }) => {
      registerRepo(local_path, repo_name)
      return { registered: { [local_path]: repo_name } }
    },
  })

  server.defineTool({
    name: 'lookup_repo',
    description: 'Look up the xtage repo name for a given local path, or list all registered repos.',
    schema: z.object({
      local_path: z.string().optional().describe('Absolute local path to look up. Omit to list all registered repos.'),
    }),
    handler: async ({ local_path }) => {
      if (local_path) {
        const repo_name = lookupRepo(local_path)
        return repo_name ? { repo_name } : { repo_name: null, note: 'Not registered. Run register_repo first.' }
      }
      return { registry: listRegistry() }
    },
  })

  server.defineTool({
    name: 'write_file_chunk',
    description: 'Write a per-file prose summary to ~/xtage/{repo-name}/files/{filename}.md. Use a slug derived from the source path (e.g. "src-index.ts.md"). Content should be a markdown prose summary of the file — purpose, key exports/functions, invariants, dependencies.',
    schema: z.object({
      repo_name: z.string().describe('Repository name'),
      filename: z.string().describe('Chunk filename (slug of source path, e.g. "src-index.ts.md")'),
      content: z.string().describe('Markdown prose summary of the file'),
      original_tokens: z.number().int().optional().describe('Token count of the original source file (for savings tracking)'),
      tags: z.array(z.string()).optional().describe('Domain tags for tokensonomy (e.g. ["auth", "api", "config"])'),
    }),
    handler: async ({ repo_name, filename, content, original_tokens, tags }) => {
      const fmLines: string[] = []
      if (original_tokens !== undefined) fmLines.push(`original_tokens: ${original_tokens}`)
      if (tags && tags.length > 0) fmLines.push(`tags: ${tags.join(', ')}`)
      const fm = fmLines.length > 0 ? `---\n${fmLines.join('\n')}\n---\n\n` : ''
      const path = fileChunkPath(repo_name, filename)
      writeXtageFile(path, fm + stripFrontmatter(content))
      return { written: path }
    },
  })

  server.defineTool({
    name: 'get_session_stats',
    description: 'Get token savings stats for the current session: chunked reads vs raw reads, tokens consumed, and estimated tokens saved by reading summaries instead of full files.',
    schema: z.object({
      repo_name: z.string().optional().describe('Filter to a specific repo. Omit for all repos.'),
    }),
    handler: async ({ repo_name }) => {
      return getSessionStats(repo_name)
    },
  })

  server.defineTool({
    name: 'sync_from_claude_memory',
    description:
      'Merge Claude auto-memory files for a project into PROJECTINSIGHTS.md. ' +
      'Called automatically via a PostToolUse hook whenever a memory file is written. ' +
      'Skips silently if the repo is not registered in xtage.',
    schema: z.object({
      memory_file_path: z.string().describe('Absolute path to the memory file that was just written'),
    }),
    handler: async ({ memory_file_path }) => {
      const { readdirSync, existsSync } = await import('fs')
      const { dirname, join } = await import('path')

      const repoName = repoNameFromMemoryPath(memory_file_path)
      if (!repoName) return { skipped: true, reason: 'Repo not registered in xtage' }

      const memDir = dirname(memory_file_path)
      if (!existsSync(memDir)) return { skipped: true, reason: 'Memory dir not found' }

      const files = readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      if (files.length === 0) return { skipped: true, reason: 'No memory files' }

      const sections: string[] = []
      for (const f of files) {
        const content = readFile(join(memDir, f))
        if (!content) continue
        const name = readFrontmatter(content, 'name') ?? f.replace('.md', '')
        const type = readFrontmatter(content, 'type') ?? 'note'
        const body = stripFrontmatter(content).trim()
        sections.push(`### [${type}] ${name}\n\n${body}`)
      }

      if (sections.length === 0) return { skipped: true, reason: 'No content in memory files' }

      const existing = readFile(projectInsightsPath(repoName)) ?? ''
      const marker = '## Claude Memory (auto-synced)'
      const newSection = `${marker}\n\n${sections.join('\n\n---\n\n')}\n`

      const updated = existing.includes(marker)
        ? existing.replace(new RegExp(`${marker}[\\s\\S]*$`), newSection)
        : existing.trimEnd() + '\n\n' + newSection

      writeXtageFile(projectInsightsPath(repoName), updated)
      return { synced: files.length, repo_name: repoName, written: projectInsightsPath(repoName) }
    },
  })

  server.defineTool({
    name: 'check_for_updates',
    description: 'Check if CODEINDEX.md is stale compared to the latest commit on GitHub',
    schema: z.object({
      repo_url: z.string().describe('GitHub repository URL'),
      repo_name: z.string().describe('Repository name (to locate CODEINDEX.md)'),
    }),
    handler: async ({ repo_url, repo_name }) => {
      const indexContent = readFile(codeIndexPath(repo_name))
      if (!indexContent) {
        return { stale: true, commits_behind: -1, reason: 'No CODEINDEX.md found. Run: npx @ruco-dev/xtage init <repo-url>' }
      }

      const lastIndexed = readFrontmatter(indexContent, 'last_indexed')
      if (!lastIndexed) {
        return { stale: true, commits_behind: -1, reason: 'No last_indexed timestamp in CODEINDEX.md' }
      }

      const result = await checkForUpdates(repo_url, lastIndexed)
      return { stale: result.stale, commits_behind: result.commitsBehind }
    },
  })
}

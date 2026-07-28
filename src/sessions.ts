/** Per-session read tracking for token savings analytics. */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { XTAGE_HOME } from './store.js'

interface ChunkedRead {
  type: 'chunked'
  file: string
  summary_tokens: number
  original_tokens: number | null
}

interface RawRead {
  type: 'raw'
  file: string
  tokens: number
}

type ReadEntry = ChunkedRead | RawRead

const SESSION_ID = new Date().toISOString()
const reads: Record<string, ReadEntry[]> = {}

function sessionsDir(repoName: string): string {
  return join(XTAGE_HOME, repoName, 'sessions')
}

function flush(repoName: string): void {
  const dir = sessionsDir(repoName)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const slug = SESSION_ID.replace(/[:.]/g, '-')
  writeFileSync(
    join(dir, `${slug}.json`),
    JSON.stringify({ session_id: SESSION_ID, repo_name: repoName, reads: reads[repoName] ?? [] }, null, 2),
    'utf8'
  )
}

export function logChunkedRead(repoName: string, file: string, summary_tokens: number, original_tokens: number | null): void {
  if (!reads[repoName]) reads[repoName] = []
  reads[repoName].push({ type: 'chunked', file, summary_tokens, original_tokens })
  flush(repoName)
}

export function logRawRead(repoName: string, file: string, tokens: number): void {
  if (!reads[repoName]) reads[repoName] = []
  reads[repoName].push({ type: 'raw', file, tokens })
  flush(repoName)
}

export function getSessionStats(repoName?: string): object {
  const repos = repoName ? [repoName] : Object.keys(reads)
  const stats: Record<string, object> = {}

  for (const repo of repos) {
    const entries = reads[repo] ?? []
    const chunked = entries.filter((r): r is ChunkedRead => r.type === 'chunked')
    const raw = entries.filter((r): r is RawRead => r.type === 'raw')

    const summary_tokens_total = chunked.reduce((s, r) => s + r.summary_tokens, 0)
    const raw_tokens_total = raw.reduce((s, r) => s + r.tokens, 0)
    const withOriginal = chunked.filter(r => r.original_tokens !== null)
    const original_tokens_total = withOriginal.reduce((s, r) => s + r.original_tokens!, 0)
    const estimated_saved = original_tokens_total - withOriginal.reduce((s, r) => s + r.summary_tokens, 0)

    stats[repo] = {
      chunked_reads: chunked.length,
      raw_reads: raw.length,
      summary_tokens: summary_tokens_total,
      raw_tokens: raw_tokens_total,
      original_tokens_known: original_tokens_total,
      estimated_saved: withOriginal.length > 0 ? estimated_saved : null,
      savings_pct: withOriginal.length > 0 && original_tokens_total > 0
        ? Math.round(estimated_saved / original_tokens_total * 100)
        : null,
    }
  }

  return { session_id: SESSION_ID, stats }
}

/** Local filesystem repo reader — mirrors fetchRepoData but reads from disk. */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { FileContent } from './chunker.js'
import { countTokensLocal } from './tokens.js'

function walk(absDir: string, relBase: string, filter: (path: string) => boolean): FileContent[] {
  const results: FileContent[] = []

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const absPath = join(absDir, entry.name)
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      results.push(...walk(absPath, relPath, filter))
    } else if (entry.isFile() && filter(relPath)) {
      try {
        const content = readFileSync(absPath, 'utf8')
        results.push({ path: relPath, content, tokens: countTokensLocal(content), is_changed: false })
      } catch {
        // skip unreadable files (binary, permission-denied, etc.)
      }
    }
  }

  return results
}

export function fetchLocalRepoData(
  localPath: string,
  filter: (path: string) => boolean
): FileContent[] {
  return walk(localPath, '', filter)
}

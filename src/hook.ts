/**
 * Git diff parser for incremental index updates.
 */
import { execSync } from 'child_process'

export interface DiffResult {
  changedFiles: string[]
  changedSymbols: Map<string, string[]>  // path → symbol names
}

const SYMBOL_RE = /^[+-](?:def |class |function |async def |export (?:default )?(?:class|function))(\w+)/m

export function parseGitDiff(diffOutput: string): DiffResult {
  const changedFiles: string[] = []
  const changedSymbols = new Map<string, string[]>()

  let currentFile: string | null = null

  for (const line of diffOutput.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/)
      if (match) {
        currentFile = match[1]
        changedFiles.push(currentFile)
      }
    } else if (currentFile && (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      const sym = line.match(SYMBOL_RE)
      if (sym) {
        const symbols = changedSymbols.get(currentFile) ?? []
        if (!symbols.includes(sym[1])) symbols.push(sym[1])
        changedSymbols.set(currentFile, symbols)
      }
    }
  }

  return { changedFiles, changedSymbols }
}

export function getGitDiff(): string {
  try {
    return execSync('git diff HEAD~1 HEAD', { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface ProgressState {
  phase: 'chunking' | 'writing'
  files?: number
  tokens?: number
  chunks?: number
  label?: string
}

export function makeProgressFile(): string {
  return join(tmpdir(), `xtage-${process.pid}.json`)
}

export function writeProgress(state: ProgressState): void {
  const file = process.env.XTAGE_PROGRESS_FILE
  if (!file) return
  try { writeFileSync(file, JSON.stringify(state)) } catch { /* ignore */ }
}

export function readProgress(file: string): ProgressState | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ProgressState) : null
  } catch { return null }
}

export function removeProgress(file: string): void {
  try { unlinkSync(file) } catch { /* ignore */ }
}

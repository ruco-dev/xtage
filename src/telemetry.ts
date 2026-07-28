/**
 * Anonymous usage telemetry — fire-and-forget, opt-in only.
 * Preference stored at ~/.xtage/telemetry.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'
import * as os from 'os'

const TELEMETRY_ENDPOINT = 'https://PLACEHOLDER_TELEMETRY_ENDPOINT/events'
const PREF_PATH = join(os.homedir(), '.xtage', 'telemetry.json')

type EventName = 'init' | 'update' | 'error' | 'general_insights_write'

interface TelemetryEvent {
  event: EventName
  timestamp: string
  [key: string]: unknown
}

let _optedIn: boolean | undefined

function loadPref(): boolean | undefined {
  try {
    if (!existsSync(PREF_PATH)) return undefined
    const parsed = JSON.parse(readFileSync(PREF_PATH, 'utf8'))
    if (typeof parsed.optedIn === 'boolean') return parsed.optedIn
    return undefined
  } catch {
    return undefined
  }
}

export function savePref(optedIn: boolean): void {
  try {
    const dir = join(os.homedir(), '.xtage')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(PREF_PATH, JSON.stringify({ optedIn }, null, 2), 'utf8')
    _optedIn = optedIn
  } catch {
    // never throw
  }
}

function isOptedIn(): boolean {
  if (process.env.XTAGE_NO_TELEMETRY === '1') return false
  if (_optedIn === undefined) {
    _optedIn = loadPref() ?? false
  }
  return _optedIn
}

function send(event: TelemetryEvent): void {
  if (!isOptedIn()) return
  Promise.resolve().then(async () => {
    try {
      await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(4000),
      })
    } catch {
      // swallow silently
    }
  })
}

export function trackInit(repoUrl: string, fileCount: number, chunkCount: number): void {
  send({ event: 'init', timestamp: new Date().toISOString(), repoUrl, fileCount, chunkCount })
}

export function trackUpdate(repoUrl: string, changedFileCount: number): void {
  send({ event: 'update', timestamp: new Date().toISOString(), repoUrl, changedFileCount })
}

export function trackError(message: string, context: string): void {
  send({ event: 'error', timestamp: new Date().toISOString(), message, context })
}

export function trackGeneralInsightsWrite(content: string): void {
  const wordCount = content.split(/\s+/).filter(Boolean).length
  send({ event: 'general_insights_write', timestamp: new Date().toISOString(), wordCount })
}

export async function promptTelemetryOptIn(): Promise<void> {
  if (loadPref() !== undefined) return
  if (!process.stdout.isTTY) {
    savePref(false)
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('\n[xtage] Help improve xtage by sending anonymous usage telemetry? (y/N) ', answer => {
      rl.close()
      savePref(answer.trim().toLowerCase() === 'y')
      resolve()
    })
  })
}
